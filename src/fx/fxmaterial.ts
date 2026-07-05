import * as THREE from 'three'

/**
 * エフェクトメッシュ用の汎用シェーダマテリアル。
 * - UVスクロール（炎の上昇・エネルギーの流れ）
 * - ノイズによるディゾルブ侵食 + 侵食エッジの発光（uDissolve 0→1 で消滅）
 * - V方向の端フェード（筒メッシュの上下端を柔らかく）
 * 黒背景テクスチャ前提の加算合成。
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uOpacity;
uniform float uTime;
uniform vec2 uScroll;
uniform vec2 uRepeat;
uniform float uDissolve;
uniform float uDissolveSoft;
uniform float uFadeTop;
uniform float uFadeBottom;
uniform float uDesaturate;
uniform float uRadialFade;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = vUv * uRepeat + uScroll * uTime;
  vec3 tex = texture2D(uMap, uv).rgb;
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));
  // 彩度除去: 色替えバリアント用（輝度×tint で色が濁らない）
  tex = mix(tex, vec3(lum), uDesaturate);

  // ディゾルブ: 2オクターブのノイズ + テクスチャ輝度で侵食パターンを作る
  float n = vnoise(vUv * 6.0 + uTime * 0.3) * 0.65 + vnoise(vUv * 19.0) * 0.35;
  n = n * 0.7 + lum * 0.3;
  float d = uDissolve * (1.0 + uDissolveSoft * 2.0) - uDissolveSoft;
  float mask = smoothstep(d, d + uDissolveSoft, n);

  // 侵食境界の発光（燃え際）
  float edge = mask - smoothstep(d + uDissolveSoft, d + uDissolveSoft * 3.5, n) * mask;

  // V方向の端フェード
  float fade = smoothstep(0.0, max(uFadeBottom, 1e-4), vUv.y)
             * smoothstep(0.0, max(uFadeTop, 1e-4), 1.0 - vUv.y);

  // 平面投影デカール用のラジアルフェード（正方形の縁を隠す）
  float rd = length(vUv - 0.5) * 2.0;
  fade *= mix(1.0, 1.0 - smoothstep(uRadialFade, 1.0, rd), step(1e-3, uRadialFade));

  // 侵食エッジの発光はテクスチャの発光部にのみ乗せる（黒地に灰色が浮くのを防ぐ）
  vec3 col = tex * uColor + uEdgeColor * edge * lum;
  gl_FragColor = vec4(col * mask * fade * uOpacity, 1.0);
}
`

export interface FxMaterialOptions {
  map: THREE.Texture
  color?: THREE.ColorRepresentation
  edgeColor?: THREE.ColorRepresentation
  opacity?: number
  /** UVスクロール速度 (u/秒, v/秒) */
  scroll?: [number, number]
  repeat?: [number, number]
  dissolveSoft?: number
  /** V=1 側のフェード幅 (0で無効) */
  fadeTop?: number
  /** V=0 側のフェード幅 (0で無効) */
  fadeBottom?: number
  /** 1でテクスチャを輝度化してtint色を素直に乗せる（色替えバリアント用） */
  desaturate?: number
  /** UV中心からこの距離で外周フェード開始 (0で無効・平面投影デカール用) */
  radialFade?: number
  side?: THREE.Side
}

/** uniforms を型安全に触るためのラッパ。 */
export class FxMaterial extends THREE.ShaderMaterial {
  constructor(o: FxMaterialOptions) {
    super({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: o.map },
        uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
        uEdgeColor: { value: new THREE.Color(o.edgeColor ?? 0x000000) },
        uOpacity: { value: o.opacity ?? 1 },
        uTime: { value: 0 },
        uScroll: { value: new THREE.Vector2(...(o.scroll ?? [0, 0])) },
        uRepeat: { value: new THREE.Vector2(...(o.repeat ?? [1, 1])) },
        uDissolve: { value: 0 },
        uDissolveSoft: { value: o.dissolveSoft ?? 0.12 },
        uFadeTop: { value: o.fadeTop ?? 0 },
        uFadeBottom: { value: o.fadeBottom ?? 0 },
        uDesaturate: { value: o.desaturate ?? 0 },
        uRadialFade: { value: o.radialFade ?? 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: o.side ?? THREE.DoubleSide,
    })
  }

  get time(): number {
    return this.uniforms.uTime.value as number
  }
  set time(v: number) {
    this.uniforms.uTime.value = v
  }

  get dissolve(): number {
    return this.uniforms.uDissolve.value as number
  }
  set dissolve(v: number) {
    this.uniforms.uDissolve.value = v
  }

  get opacity2(): number {
    return this.uniforms.uOpacity.value as number
  }
  set opacity2(v: number) {
    this.uniforms.uOpacity.value = v
  }
}
