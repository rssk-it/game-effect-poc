import * as THREE from 'three'
import gsap from 'gsap'

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
uniform sampler2D uMap2;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uOpacity;
uniform float uTime;
uniform vec2 uScroll;
uniform vec2 uRepeat;
uniform vec2 uScroll2;
uniform vec2 uRepeat2;
uniform float uLayerMix;
uniform float uDistort;
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
  // UV歪み: ノイズで揺らめかせる（熱・水・エネルギーの揺らぎ）
  vec2 baseUv = vUv;
  if (uDistort > 0.0) {
    float dn = vnoise(vUv * 3.5 + uTime * 0.55);
    float dn2 = vnoise(vUv * 7.0 - uTime * 0.4);
    baseUv += vec2(dn - 0.5, dn2 - 0.5) * uDistort;
  }

  vec2 uv = baseUv * uRepeat + uScroll * uTime;
  vec3 tex = texture2D(uMap, uv).rgb;

  // 第2テクスチャレイヤ: 独立スクロールの「光の流れ」を乗算合成
  if (uLayerMix > 0.0) {
    vec3 tex2 = texture2D(uMap2, baseUv * uRepeat2 + uScroll2 * uTime).rgb;
    float lum2 = dot(tex2, vec3(0.299, 0.587, 0.114));
    tex *= mix(vec3(1.0), vec3(lum2 * 1.9 + 0.15), uLayerMix);
  }

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
  /** 第2テクスチャレイヤ（光の流れ）。layerMix > 0 で有効 */
  map2?: THREE.Texture
  scroll2?: [number, number]
  repeat2?: [number, number]
  /** 第2レイヤの乗算強度 0〜1 */
  layerMix?: number
  /** ノイズによるUV歪み強度（0.03〜0.1程度） */
  distort?: number
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
        uMap2: { value: o.map2 ?? o.map },
        uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
        uEdgeColor: { value: new THREE.Color(o.edgeColor ?? 0x000000) },
        uOpacity: { value: o.opacity ?? 1 },
        uTime: { value: 0 },
        uScroll: { value: new THREE.Vector2(...(o.scroll ?? [0, 0])) },
        uRepeat: { value: new THREE.Vector2(...(o.repeat ?? [1, 1])) },
        uScroll2: { value: new THREE.Vector2(...(o.scroll2 ?? [0, 0])) },
        uRepeat2: { value: new THREE.Vector2(...(o.repeat2 ?? [1, 1])) },
        uLayerMix: { value: o.layerMix ?? 0 },
        uDistort: { value: o.distort ?? 0 },
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

  /** tint色uniform（gsapでr/g/bを直接tweenできる） */
  get tint(): THREE.Color {
    return this.uniforms.uColor.value as THREE.Color
  }
}

/**
 * 色のキーフレームアニメーション。stops の色を duration 全体に等間隔で並べ、
 * 順に遷移させる（例: 白 → 橙 → 暗赤 で「熱が冷める」表現）。
 */
export function colorRamp(mat: FxMaterial, stops: THREE.ColorRepresentation[], duration: number, delay = 0): void {
  if (stops.length === 0) return
  mat.tint.set(stops[0])
  if (stops.length === 1) return
  const step = duration / (stops.length - 1)
  const tl = gsap.timeline({ delay })
  for (let i = 1; i < stops.length; i++) {
    const c = new THREE.Color(stops[i])
    tl.to(mat.tint, { r: c.r, g: c.g, b: c.b, duration: step, ease: 'power1.inOut' })
  }
}
