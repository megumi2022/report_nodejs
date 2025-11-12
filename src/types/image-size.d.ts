declare module "image-size" {
    interface ImageSizeResult {
        width?: number;
        height?: number;
        type?: string;
        density?: number;
    }

    export default function imageSize(input: ArrayBuffer | Buffer | string): ImageSizeResult;
}
