import * as THREE from 'three'
import { FxManager, type Updatable } from './particles'
import type { FxMaterial } from './fxmaterial'
import { glowTexture } from './textures'

/** ワイヤーフレーム表示（ビューアのデバッグ用）。生存中のFXにも即時反映される。 */
let wireframeEnabled = false
const activeFx = new Set<MeshFx>()

export function setFxWireframe(enabled: boolean): void {
  wireframeEnabled = enabled
  for (const fx of activeFx) fx.setWireframe(enabled)
}

export function getFxWireframe(): boolean {
  return wireframeEnabled
}

/**
 * メッシュFXの共通土台。
 * - uTime の前進を全 FxMaterial へ配線
 * - グループ・マテリアル・専用ジオメトリの破棄を一元化
 * - ワイヤーフレーム表示とグロースプライトの簡易エミッターを提供
 * 各エフェクトは constructor でパーツを組み、gsap で kill() を呼んで自壊する。
 */
export abstract class MeshFx implements Updatable {
  readonly group = new THREE.Group()
  protected mats: FxMaterial[] = []
  protected meshes: THREE.Mesh[] = []
  private wires: THREE.Mesh[] = []
  private wireMat: THREE.MeshBasicMaterial | null = null
  /** GLB共有ジオメトリと違い、インスタンス固有に生成したジオメトリは破棄が必要 */
  private ownedGeos: THREE.BufferGeometry[] = []
  /** FxMaterial以外の付随マテリアル（スプライト等）の破棄用 */
  private ownedMats: THREE.Material[] = []
  /** dispose() を持つ任意のリソース（ParticleField等）の破棄用 */
  private ownedDisposables: Array<{ dispose(): void }> = []
  protected t = 0
  protected dead = false

  constructor(protected fx: FxManager) {}

  protected addMesh(geo: THREE.BufferGeometry, mat: FxMaterial, renderOrder = 7): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = renderOrder
    this.group.add(mesh)
    this.mats.push(mat)
    this.meshes.push(mesh)
    return mesh
  }

  /** このFX専用に生成したジオメトリを登録し、破棄時に dispose する。 */
  protected ownGeometry<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeos.push(geo)
    return geo
  }

  /** FxMaterial以外のマテリアルを登録し、破棄時に dispose する。 */
  protected ownMaterial<T extends THREE.Material>(mat: T): T {
    this.ownedMats.push(mat)
    return mat
  }

  /** dispose() を持つ任意のリソースを登録し、破棄時に呼ぶ。 */
  protected own<T extends { dispose(): void }>(res: T): T {
    this.ownedDisposables.push(res)
    return res
  }

  /** グロースプライト（ビルボード）をグループに追加する簡易エミッター。 */
  protected addGlowSprite(color: THREE.ColorRepresentation, scaleX: number, scaleY: number, opacity = 1): THREE.Sprite {
    const sprite = new THREE.Sprite(
      this.ownMaterial(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    )
    sprite.scale.set(scaleX, scaleY, 1)
    sprite.renderOrder = 6
    this.group.add(sprite)
    return sprite
  }

  /** 各FXメッシュの子としてワイヤー用メッシュを付け外しする（トランスフォームを継承）。 */
  setWireframe(enabled: boolean): void {
    if (enabled && this.wires.length === 0) {
      this.wireMat ??= new THREE.MeshBasicMaterial({
        wireframe: true,
        color: 0x6cff9e,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      })
      for (const mesh of this.meshes) {
        const wire = new THREE.Mesh(mesh.geometry, this.wireMat)
        wire.renderOrder = 9
        mesh.add(wire)
        this.wires.push(wire)
      }
    } else if (!enabled && this.wires.length > 0) {
      for (const wire of this.wires) wire.removeFromParent()
      this.wires = []
    }
  }

  protected start(): void {
    this.fx.scene.add(this.group)
    this.fx.add(this)
    activeFx.add(this)
    if (wireframeEnabled) this.setWireframe(true)
  }

  kill(): void {
    this.dead = true
  }

  protected abstract onUpdate(dt: number): void

  update(dt: number): boolean {
    if (this.dead) {
      this.fx.scene.remove(this.group)
      for (const m of this.mats) m.dispose()
      for (const m of this.ownedMats) m.dispose()
      for (const g of this.ownedGeos) g.dispose()
      for (const d of this.ownedDisposables) d.dispose()
      this.wireMat?.dispose()
      activeFx.delete(this)
      return false
    }
    this.t += dt
    for (const m of this.mats) m.time = this.t
    this.onUpdate(dt)
    return true
  }
}
