/**
 * FXモジュールの公開API。
 *
 * 構成:
 * - particles.ts  … FxManager（更新ループ）+ 汎用バーストパーティクル
 * - fxmaterial.ts … UVスクロール/ディゾルブ/多重テクスチャのカスタムシェーダ
 * - assets.ts     … Blender製GLB + image-gen製テクスチャのロード
 * - meshfx.ts     … メッシュFXの共通基底（破棄・ワイヤーフレーム）
 * - field.ts      … CPU駆動パーティクルのバッファ配管
 * - effects/*     … 1エフェクト1ファイル
 * - impact.ts / magic.ts / textures.ts … 軽量ヘルパー
 */

export { FxManager, ParticleBurst, type Updatable, type BurstOptions } from './particles'
export { FxMaterial, colorRamp, type FxMaterialOptions } from './fxmaterial'
export { loadFxAssets, type FxAssets } from './assets'
export { MeshFx, setFxWireframe, getFxWireframe } from './meshfx'
export { ParticleField, type ParticleFieldOptions } from './field'

export * from './effects/slash-trail'
export * from './effects/fire-vortex'
export * from './effects/shockwave'
export * from './effects/ground-crack'
export * from './effects/light-motes'
export * from './effects/holy-pillar'
export * from './effects/heal'
export * from './effects/rising-rings'
export * from './effects/frost-spikes'
export * from './effects/lightning'
export * from './effects/roar'

export * from './impact'
export * from './magic'
export { glowTexture, sparkTexture, ringTexture, starTexture, blobShadowTexture, smokeTexture } from './textures'
