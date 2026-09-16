/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import type { Config } from '@/config.js';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import { StatusError } from '@/misc/status-error.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { resolveDecodedSource } from '@/misc/juice-extra-image-decoders.js';
import { IImageStreamable, ImageProcessingService, webpDefault } from '@/core/ImageProcessingService.js';
import type Logger from '@/logger.js';
import { createRangeStream, attachStreamCleanup, needsCleanup } from './FileServerUtils.js';
import type { DownloadedFileResult, FileResolveResult, FileServerFileResolver } from './FileServerFileResolver.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

type ProxySource = DownloadedFileResult | FileResolveResult;
type CleanupableFile = ProxySource & { cleanup: () => void };
type AvailableFile = Exclude<ProxySource, { kind: 'not-found' | 'unavailable' }>;
type ProxyQuery = {
	emoji?: string;
	avatar?: string;
	static?: string;
	preview?: string;
	badge?: string;
	origin?: string;
	url?: string;
};

export class FileServerProxyHandler {
	constructor(
		private config: Config,
		private fileResolver: FileServerFileResolver,
		private assetsPath: string,
		private imageProcessingService: ImageProcessingService,
		private logger: Logger,
	) {}

	public async handle(request: FastifyRequest<{ Params: { url: string }; Querystring: ProxyQuery }>, reply: FastifyReply) {
		const url = 'url' in request.query ? request.query.url : 'https://' + request.params.url;

		if (typeof url !== 'string') {
			reply.code(400);
			return;
		}

		// アバタークロップなど、どうしてもオリジンである必要がある場合
		const mustOrigin = 'origin' in request.query;

		if (this.config.externalMediaProxyEnabled && !mustOrigin) {
			return await this.redirectToExternalProxy(request, reply);
		}

		this.validateUserAgent(request);

		// Create temp file
		const file = await this.getStreamAndTypeFromUrl(url);
		if (file.kind === 'not-found') {
			reply.code(404);
			reply.header('Cache-Control', 'max-age=86400');
			return reply.sendFile('/dummy.png', this.assetsPath);
		}

		if (file.kind === 'unavailable') {
			reply.code(204);
			reply.header('Cache-Control', 'max-age=86400');
			return;
		}

		try {
			const image = await this.processImage(file, request, reply);

			if (needsCleanup(file)) {
				attachStreamCleanup(image.data, file.cleanup);
			}

			reply.header('Content-Type', image.type);
			reply.header('Cache-Control', 'max-age=31536000, immutable');
			reply.header('Content-Disposition',
				contentDisposition(
					'inline',
					correctFilename(file.filename, image.ext),
				),
			);
			return image.data;
		} catch (e) {
			if (needsCleanup(file)) file.cleanup();
			// JUICE: file-typeのシグネチャ判定は先頭バイトだけを見るため、TGA等ヘッダーに
			// 確実な識別子を持たない形式が別形式(例: image/x-icon)に誤検出されることがある。
			// その場合、実体は宣言された形式として不正なデータのため、@misskey-dev/sharp-read-bmp
			// のICO/BMPデコード処理(あるいはsharp自体)が例外を投げる(不正なデータに対する
			// 想定外の例外であり、StatusErrorとして意図的に投げたものではない)。想定外の例外を
			// そのまま再送出すると生の500になってしまうため、意図的なStatusErrorはそのまま、
			// それ以外は画像処理失敗として404にフォールバックさせる。
			// ただしデコーダ自体の不具合を見逃さないよう、変換前にログへ残す
			if (e instanceof StatusError) throw e;
			this.logger.warn(`Failed to process image (mime=${file.mime}): ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
			throw new StatusError('Failed to process image', 404, 'Failed to process image');
		}
	}

	/**
	 * 外部メディアプロキシにリダイレクトする
	 */
	private async redirectToExternalProxy(
		request: FastifyRequest<{ Params: { url: string }; Querystring: ProxyQuery }>,
		reply: FastifyReply,
	) {
		reply.header('Cache-Control', 'public, max-age=259200'); // 3 days

		const url = new URL(`${this.config.mediaProxy}/${request.params.url || ''}`);

		for (const [key, value] of Object.entries(request.query)) {
			url.searchParams.append(key, value);
		}

		return reply.redirect(url.toString(), 301);
	}

	/**
	 * User-Agent を検証する
	 */
	private validateUserAgent(request: FastifyRequest): void {
		if (!request.headers['user-agent']) {
			throw new StatusError('User-Agent is required', 400, 'User-Agent is required');
		}
		if (request.headers['user-agent'].toLowerCase().indexOf('misskey/') !== -1) {
			throw new StatusError('Refusing to proxy a request from another proxy', 403, 'Proxy is recursive');
		}
	}

	/**
	 * 画像を処理してストリーム可能な形式に変換する
	 */
	private async processImage(
		file: AvailableFile,
		request: FastifyRequest<{ Params: { url: string }; Querystring: ProxyQuery }>,
		reply: FastifyReply,
	): Promise<IImageStreamable> {
		const query = request.query;

		// JUICE: sharp(libvips)単体ではデコードできない画像形式(JPEG XL・HEIC/HEIF)は、
		// 専用デコーダで事前にPNGへ変換しておく。以降はsourceが常に「sharpで直接扱える
		// もの」になるため、この関数の外(processEmojiOrAvatar等)は元のmime/pathを使う場合と
		// 何も変わらない
		const { source, mime } = await resolveDecodedSource(file.path, file.mime);

		const requiresImageConversion = 'emoji' in query || 'avatar' in query || 'static' in query || 'preview' in query || 'badge' in query;
		const isConvertibleImage = isMimeImage(mime, 'sharp-convertible-image-with-bmp');
		if (requiresImageConversion && !isConvertibleImage) {
			throw new StatusError('Unexpected mime', 404);
		}

		if ('emoji' in query || 'avatar' in query) {
			return this.processEmojiOrAvatar(file, query, source, mime);
		}

		if ('static' in query) {
			return this.imageProcessingService.convertSharpToWebpStream(await sharpBmp(source, mime), 498, 422);
		}

		if ('preview' in query) {
			return this.imageProcessingService.convertSharpToWebpStream(await sharpBmp(source, mime), 200, 200);
		}

		if ('badge' in query) {
			return this.processBadge(source, mime);
		}

		if (mime === 'image/svg+xml') {
			return this.imageProcessingService.convertToWebpStream(file.path, 2048, 2048);
		}

		// JUICE: 専用デコーダで変換済み(=元は本家では表示できなかった形式)の場合は、
		// 変換後のPNGとしてそのまま返す(browsersafe判定は変換後のPNGなので通す必要が無い)
		if (mime !== file.mime) {
			return {
				data: Readable.from(source as Buffer),
				ext: 'png',
				type: 'image/png',
			};
		}

		if (!file.mime.startsWith('image/') || !FILE_TYPE_BROWSERSAFE.includes(file.mime)) {
			throw new StatusError('Rejected type', 403, 'Rejected type');
		}

		return this.createDefaultStream(file, request, reply);
	}

	/**
	 * 絵文字またはアバター用の画像を処理する
	 */
	private async processEmojiOrAvatar(
		file: AvailableFile,
		query: Pick<ProxyQuery, 'emoji' | 'avatar' | 'static'>,
		source: string | Buffer,
		mime: string,
	): Promise<IImageStreamable> {
		const isAnimationConvertibleImage = isMimeImage(mime, 'sharp-animation-convertible-image-with-bmp');
		if (!isAnimationConvertibleImage && !('static' in query)) {
			return {
				data: fs.createReadStream(file.path),
				ext: file.ext,
				type: file.mime,
			};
		}

		const data = (await sharpBmp(source, mime, { animated: !('static' in query) }))
			.resize({
				height: 'emoji' in query ? 128 : 320,
				withoutEnlargement: true,
			})
			.webp(webpDefault);

		return {
			data,
			ext: 'webp',
			type: 'image/webp',
		};
	}

	/**
	 * バッジ用の画像を処理する
	 */
	private async processBadge(source: string | Buffer, mime: string): Promise<IImageStreamable> {
		const mask = (await sharpBmp(source, mime))
			.resize(96, 96, {
				fit: 'contain',
				position: 'centre',
				withoutEnlargement: false,
			})
			.greyscale()
			.normalise()
			.linear(1.75, -(128 * 1.75) + 128) // 1.75x contrast
			.flatten({ background: '#000' })
			.toColorspace('b-w');

		const stats = await mask.clone().stats();

		if (stats.entropy < 0.1) {
			throw new StatusError('Skip to provide badge', 404);
		}

		const data = sharp({
			create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.pipelineColorspace('b-w')
			.boolean(await mask.png().toBuffer(), 'eor');

		return {
			data: await data.png().toBuffer(),
			ext: 'png',
			type: 'image/png',
		};
	}

	/**
	 * デフォルトのストリームを作成する（Range リクエスト対応）
	 */
	private createDefaultStream(
		file: AvailableFile,
		request: FastifyRequest,
		reply: FastifyReply,
	): IImageStreamable {
		if (request.headers.range && 'file' in file && file.file.size > 0) {
			const { stream, start, end, chunksize } = createRangeStream(request.headers.range as string, file.file.size, file.path);

			reply.header('Content-Range', `bytes ${start}-${end}/${file.file.size}`);
			reply.header('Accept-Ranges', 'bytes');
			reply.header('Content-Length', chunksize);
			reply.code(206);

			return {
				data: stream,
				ext: file.ext,
				type: file.mime,
			};
		}

		return {
			data: fs.createReadStream(file.path),
			ext: file.ext,
			type: file.mime,
		};
	}

	private async getStreamAndTypeFromUrl(url: string): Promise<ProxySource> {
		if (url.startsWith(`${this.config.url}/files/`)) {
			const key = url.replace(`${this.config.url}/files/`, '').split('/').shift();
			if (!key) throw new StatusError('Invalid File Key', 400, 'Invalid File Key');

			return await this.fileResolver.resolveFileByAccessKey(key);
		}

		return await this.fileResolver.downloadAndDetectTypeFromUrl(url);
	}
}
