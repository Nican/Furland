/**
 * Sigma.js WebGL Renderer Node Program
 * =====================================
 *
 * Program rendering nodes using GL_POINTS, but that draws an image on top of
 * the classic colored disc.
 * @module
 */

import Sigma from "sigma";
import { AbstractNodeProgram } from "sigma/rendering/webgl/programs/common/node";
import { RenderParams } from "sigma/rendering/webgl/programs/common/program";
import { Coordinates, Dimensions, NodeDisplayData } from "sigma/types";
import { floatColor } from 'sigma/utils';

const vertexShaderSource = `attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;
attribute vec4 a_texture;

uniform float u_ratio;
uniform float u_scale;
uniform mat3 u_matrix;

varying vec4 v_color;
varying float v_border;
varying vec4 v_texture;

const float bias = 255.0 / 254.0;

void main() {
  gl_Position = vec4(
    (u_matrix * vec3(a_position, 1)).xy,
    0,
    1
  );

  // Multiply the point size twice:
  //  - x SCALING_RATIO to correct the canvas scaling
  //  - x 2 to correct the formulae
  gl_PointSize = a_size * u_ratio * u_scale * 2.0;

  v_border = (1.0 / u_ratio) * (0.5 / a_size);

  // Extract the color:
  v_color = a_color;
  v_color.a *= bias;

  // Pass the texture coordinates:
  v_texture = a_texture;
}`;

const fragmentShaderSource = `precision mediump float;

varying vec4 v_color;
varying float v_border;
varying vec4 v_texture;

uniform sampler2D u_atlas;

const float radius = 0.5;

void main(void) {
  vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);
  vec4 color;

  if (v_texture.w > 0.0) {
    vec4 texel = texture2D(u_atlas, v_texture.xy + gl_PointCoord * v_texture.zw, -1.0);
    color = vec4(mix(v_color, texel, texel.a).rgb, max(texel.a, v_color.a));
  } else {
    color = v_color;
  }

  vec2 m = gl_PointCoord - vec2(0.5, 0.5);
  float dist = length(m);

  if (dist < radius - v_border) {
    gl_FragColor = color;
  } else if (dist < radius) {
    gl_FragColor = mix(transparent, color, (radius - dist) / v_border);
  } else {
    gl_FragColor = transparent;
  }
}`;


const POINTS = 1,
  ATTRIBUTES = 8,
  MAX_TEXTURE_SIZE = 100;

type ImageLoading = { status: "loading" };
type ImageError = { status: "error" };
type ImagePending = { status: "pending"; image: HTMLImageElement };
type ImageReady = { status: "ready" } & Coordinates & Dimensions;
type ImageType = (ImageLoading | ImageError | ImagePending | ImageReady) & { x?: number; y?: number; };

// This class only exists for the return typing of `getNodeImageProgram`:
class AbstractNodeImageProgram extends AbstractNodeProgram {
  /* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars */
  constructor(gl: WebGLRenderingContext, renderer: Sigma) {
    super(gl, vertexShaderSource, fragmentShaderSource, POINTS, ATTRIBUTES);
  }
  bind(): void { }
  process(data: NodeDisplayData & { image?: string }, hidden: boolean, offset: number): void { }
  render(params: RenderParams): void { }
  rebindTexture() { }
  /* eslint-enable @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars */
}

/**
 * To share the texture between the program instances of the graph and the
 * hovered nodes (to prevent some flickering, mostly), this program must be
 * "built" for each sigma instance:
 */
export default function getNodeImageProgram(): typeof AbstractNodeImageProgram {
  /**
   * These attributes are shared between all instances of this exact class,
   * returned by this call to getNodeProgramImage:
   */
  const rebindTextureFns: (() => void)[] = [];
  const images: Record<string, ImageType> = {};
  let textureImage: ImageData;
  let hasReceivedImages = false;
  let pendingImagesFrameID: number | undefined = undefined;

  /**
   * Helper to load an image:
   */
  function loadImage(imageSource: string): void {
    if (images[imageSource]) return;

    const image = new Image();
    image.addEventListener("load", () => {
      images[imageSource] = {
        status: "pending",
        image,
      };

      if (typeof pendingImagesFrameID !== "number") {
        pendingImagesFrameID = requestAnimationFrame(() => finalizePendingImages());
      }
    });
    image.addEventListener("error", () => {
      images[imageSource] = { status: "error" };
    });
    images[imageSource] = { status: "loading" };

    // Load image:
    image.setAttribute("crossOrigin", "");
    image.src = imageSource;
  }

  let imageWidth = 0;
  let imageHeight = 0;
  let imagePlace = { dx: 0, dy: 0 };

  /**
   * Helper that takes all pending images and adds them into the texture:
   */
  function finalizePendingImages(): void {
    pendingImagesFrameID = undefined;

    const pendingImages: { image: HTMLImageElement; id: string; size: number }[] = [];

    // List all pending images:
    for (const id in images) {
      const state = images[id];
      if (state.status === "pending") {
        pendingImages.push({
          id,
          image: state.image,
          size: Math.min(state.image.width, state.image.height) || 1,
        });
      }
    }

    // Add images to texture:
    const canvas = document.createElement("canvas");
    const maxWidth = 8192;


    pendingImages.forEach(({ id, image, size }) => {
      const imageSizeInTexture = Math.min(MAX_TEXTURE_SIZE, size);

      if (imagePlace.dx > maxWidth) {
        imagePlace.dx = 0;
        imagePlace.dy += imageSizeInTexture;
        imageHeight = Math.max(imageHeight, imagePlace.dy + imageSizeInTexture);
      } else {
        imageWidth = Math.max(imageWidth, imagePlace.dx + imageSizeInTexture);
      }

      images[id] = {
        status: "ready",
        x: imagePlace.dx,
        y: imagePlace.dy,
        width: imageSizeInTexture,
        height: imageSizeInTexture,
      };

      imagePlace.dx += imageSizeInTexture;
    });

    if(imageHeight === 0){
      return;
    }

    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    if (hasReceivedImages) {
      ctx.putImageData(textureImage, 0, 0);
    }

    pendingImages.forEach(({ id, image, size }) => {
      try {
        const imageSizeInTexture = Math.min(MAX_TEXTURE_SIZE, size);

        // Crop image, to only keep the biggest square, centered:
        let dx = images[id].x!;
        let dy = images[id].y!;
        ctx.drawImage(image, 0, 0, 48, 48, dx, dy, imageSizeInTexture, imageSizeInTexture);
      } catch (e) {
        console.log(id, image.width, image.height);
        console.log(e);
      }

    });

    console.log('Height: ', canvas.width);

    textureImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    hasReceivedImages = true;
    rebindTextureFns.forEach((fn) => fn());
  }

  return class NodeImageProgram extends AbstractNodeProgram {
    texture: WebGLTexture;
    textureLocation: GLint;
    atlasLocation: WebGLUniformLocation;
    latestRenderParams?: RenderParams;

    constructor(gl: WebGLRenderingContext, renderer: Sigma) {
      super(gl, vertexShaderSource, fragmentShaderSource, POINTS, ATTRIBUTES);

      rebindTextureFns.push(() => {
        if (this && this.rebindTexture) this.rebindTexture();
        if (renderer && renderer.refresh) renderer.refresh();
      });

      textureImage = new ImageData(1, 1);

      // Attribute Location
      this.textureLocation = gl.getAttribLocation(this.program, "a_texture");

      // Uniform Location
      const atlasLocation = gl.getUniformLocation(this.program, "u_atlas");
      if (atlasLocation === null) throw new Error("NodeProgramImage: error while getting atlasLocation");
      this.atlasLocation = atlasLocation;

      // Initialize WebGL texture:
      this.texture = gl.createTexture() as WebGLTexture;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

      this.bind();
    }

    bind(): void {
      super.bind();

      const gl = this.gl;

      gl.enableVertexAttribArray(this.textureLocation);
      gl.vertexAttribPointer(
        this.textureLocation,
        4,
        gl.FLOAT,
        false,
        this.attributes * Float32Array.BYTES_PER_ELEMENT,
        16,
      );
    }

    process(data: NodeDisplayData & { image?: string }, hidden: boolean, offset: number): void {
      const array = this.array;
      let i = offset * POINTS * ATTRIBUTES;

      const imageSource = data.image;
      const imageState = imageSource && images[imageSource];
      if (typeof imageSource === "string" && !imageState) loadImage(imageSource);

      if (hidden) {
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        // Texture:
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        return;
      }

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = data.size;
      array[i++] = floatColor(data.color);

      // Reference texture:
      if (imageState && imageState.status === "ready") {
        const { width, height } = textureImage;
        array[i++] = imageState.x / width;
        array[i++] = imageState.y / height;
        array[i++] = imageState.width / width;
        array[i++] = imageState.height / height;
      } else {
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
      }
    }

    render(params: RenderParams): void {
      if (this.hasNothingToRender()) return;

      this.latestRenderParams = params;

      const gl = this.gl;

      const program = this.program;
      gl.useProgram(program);

      gl.uniform1f(this.ratioLocation, 1 / Math.sqrt(params.ratio));
      gl.uniform1f(this.scaleLocation, params.scalingRatio);
      gl.uniformMatrix3fv(this.matrixLocation, false, params.matrix);
      gl.uniform1i(this.atlasLocation, 0);

      gl.drawArrays(gl.POINTS, 0, this.array.length / ATTRIBUTES);
    }

    rebindTexture() {
      const gl = this.gl;

      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImage);
      gl.generateMipmap(gl.TEXTURE_2D);

      if (this.latestRenderParams) {
        this.bind();
        this.bufferData();
        this.render(this.latestRenderParams);
      }
    }
  };
}