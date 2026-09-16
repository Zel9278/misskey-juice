/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import rename from 'rename';
import type { Config } from '@/config.js';
import type { IImageStreamable } from '@/core/ImageProcessingService.js';
import { StatusError } from '@/misc/status-error.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { resolveDecodedSource } from '@/misc/juice-extra-image-decoders.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { attachStreamCleanup, handleRangeRequest, setFileResponseHeaders, getSafeContentType, needsCleanup } from './FileServerUtils.js';
import type { FileServerFileResolver } from './FileServerFileResolver.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type Logger from '@/logger.js';

export class FileServerDriveHandler {
	constructor(
		private config: Config,
		private fileResolver: FileServerFileResolver,
		private assetsPath: string,
		private videoProcessingService: VideoProcessingService,
		private logger: Logger,
	) {}

	public async handle(request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) {
		const key = request.params.key;
		const file = await this.fileResolver.resolveFileByAccessKey(key);

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
			if (file.kind === 'remote') {
				let image: IImageStreamable | null = null;

				if (file.fileRole === 'thumbnail') {
					if (isMimeImage(file.mime, 'sharp-convertible-image-with-bmp')) {
						reply.header('Cache-Control', 'max-age=31536000, immutable');

						const url = new URL(`${this.config.mediaProxy}/static.webp`);
						url.searchParams.set('url', file.url);
						url.searchParams.set('static', '1');

						file.cleanup();
						return await reply.redirect(url.toString(), 301);
					} else if (file.mime.startsWith('video/')) {
						const externalThumbnail = this.videoProcessingService.getExternalVideoThumbnailUrl(file.url);
						if (externalThumbnail) {
							file.cleanup();
							return await reply.redirect(externalThumbnail, 301);
						}

						image = await this.videoProcessingService.generateVideoThumbnail(file.path);
					}
				}

				if (file.fileRole === 'webpublic') {
					if (['image/svg+xml'].includes(file.mime)) {
						reply.header('Cache-Control', 'max-age=31536000, immutable');

						const url = new URL(`${this.config.mediaProxy}/svg.webp`);
						url.searchParams.set('url', file.url);

						file.cleanup();
						return await reply.redirect(url.toString(), 301);
					}
				}

				if (image == null) {
					// JUICE: sharp(libvips)が直接デコードできない形式(JPEG XL・HEIC/HEIF)は、
					// 専用デコーダでPNGへ変換してから配信する(対象外ならpath/mimeそのまま)
					const { source, mime } = await resolveDecodedSource(file.path, file.mime);
					image = typeof source === 'string'
						? {
							data: handleRangeRequest(reply, request.headers.range as string | undefined, file.file.size, file.path),
							ext: file.ext,
							type: file.mime,
						}
						: {
							data: source,
							ext: 'png',
							type: mime,
						};
				}

				attachStreamCleanup(image.data, file.cleanup);

				// JUICE: デコーダ変換後はBufferとして返しており、サイズがfile.file.size(元ファイル)
				// と一致しないため、実データのサイズをContent-Lengthとして使う
				reply.header('Content-Type', getSafeContentType(image.type));
				reply.header('Content-Length', Buffer.isBuffer(image.data) ? image.data.length : file.file.size);
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				reply.header('Content-Disposition',
					contentDisposition(
						'inline',
						correctFilename(file.filename, image.ext),
					),
				);
				return image.data;
			}

			if (file.fileRole !== 'original') {
				const filename = rename(file.filename, {
					suffix: file.fileRole === 'thumbnail' ? '-thumb' : '-web',
					extname: file.ext ? `.${file.ext}` : '.unknown',
				}).toString();

				setFileResponseHeaders(reply, { mime: file.mime, filename });
				return handleRangeRequest(reply, request.headers.range as string | undefined, file.file.size, file.path);
			} else {
				// JUICE: sharp(libvips)が直接デコードできない形式(JPEG XL・HEIC/HEIF)は、
				// 専用デコーダでPNGへ変換してから配信する(対象外ならpath/mimeそのまま)
				const { source, mime } = await resolveDecodedSource(file.path, file.mime);
				if (typeof source === 'string') {
					setFileResponseHeaders(reply, { mime: file.file.type, filename: file.filename, size: file.file.size });
					return handleRangeRequest(reply, request.headers.range as string | undefined, file.file.size, file.path);
				}
				setFileResponseHeaders(reply, { mime, filename: correctFilename(file.filename, 'png'), size: source.length });
				return source;
			}
		} catch (e) {
			if (file.kind === 'remote') file.cleanup();
			// JUICE: 専用デコーダの想定外の失敗(壊れたJXL/HEICファイル等)を生の500にせず、
			// FileServerProxyHandlerと同じ方針で404にフォールバックさせる
			if (e instanceof StatusError) throw e;
			this.logger.warn(`Failed to serve drive file (mime=${file.mime}): ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
			throw new StatusError('Failed to process file', 404, 'Failed to process file');
		}
	}
}
