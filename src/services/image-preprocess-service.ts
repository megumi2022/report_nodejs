/// <reference path="../types/image-size.d.ts" />
import sizeOf from "image-size";
import { AssetIndexRecord } from "./asset-registry-service.ts";
import { AssetChunkService } from "./asset-chunk-service.ts";

export class ImagePreprocessService {
    constructor(private readonly chunkService = new AssetChunkService()) { }

    async process(asset: AssetIndexRecord, buffer: Buffer): Promise<number> {
        const dimensions = sizeOf(buffer);
        const description = `image:${asset.filename}`;
        await this.chunkService.saveChunks([
            {
                assetId: asset.id,
                chunkIndex: 0,
                content: description,
                tokenCount: description.split(/\s+/).length,
                embedding: null,
                metadata: {
                    type: "image",
                    width: dimensions.width ?? null,
                    height: dimensions.height ?? null,
                    density: dimensions.density ?? null,
                },
            },
        ]);

        return 1;
    }
}
