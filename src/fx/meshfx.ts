import * as THREE from 'three'
import { FxManager, type Updatable } from './particles'
import type { FxMaterial } from './fxmaterial'
import { glowTexture } from './textures'
import { _setWireframeFlag, isWireframeOn } from './wire-state'

/** ワイヤーフレーム表示（ビューアのデバッグ用）。生存中のFXにも即時反映される。 */
const activeFx = new Set<MeshFx>()

export function setFxWireframe(enabled: boolean): void {
  _setWireframeFlag(enabled)
  for (const fx of activeFx) fx.setWireframe(enabled)
}

export function getFxWireframe(): boolean {
  return isWireframeOn()
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
  private wired = new Set<THREE.Mesh>()
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
    if (isWireframeOn()) this.setWireframe(true) // start() 後に追加されるメッシュにもワイヤーを付ける
    return mesh
  }

  /** FxMaterial以外のマテリアルで描くメッシュ（落雷のチューブ等）を追加する。 */
  protected addPlainMesh(geo: THREE.BufferGeometry, mat: THREE.Material, renderOrder = 7): THREE.Mesh {
    const mesh = new THREE.Mesh(this.ownGeometry(geo), this.ownMaterial(mat))
    mesh.renderOrder = renderOrder
    this.group.add(mesh)
    this.meshes.push(mesh)
    if (isWireframeOn()) this.setWireframe(true)
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

  /** group に直接追加した要素（ParticleField等）へワイヤーフレーム状態を再適用する。 */
  protected refreshWireframe(): void {
    if (isWireframeOn()) this.setWireframe(true)
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
    if (isWireframeOn()) sprite.material.visible = false
    return sprite
  }

  /**
   * ワイヤーフレーム表示の付け外し。
   * ON の間はマテリアル描画（発光テクスチャ・スプライト・パーティクル）を隠し、
   * メッシュ構造だけを見せる。start() 後に増えたメッシュにも追従する。
   */
  setWireframe(enabled: boolean): void {
    if (enabled) {
      this.wireMat ??= new THREE.MeshBasicMaterial({
        wireframe: true,
        color: 0x6cff9e,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
      for (const mesh of this.meshes) {
        if (this.wired.has(mesh)) continue
        const wire = new THREE.Mesh(mesh.geometry, this.wireMat)
        wire.renderOrder = 9
        mesh.add(wire)
        this.wires.push(wire)
        this.wired.add(mesh)
      }
    } else if (this.wires.length > 0) {
      for (const wire of this.wires) wire.removeFromParent()
      this.wires = []
      this.wired.clear()
    }
    // メッシュのみ表示: ワイヤー以外の全マテリアルの描画を切り替える
    this.group.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.Material | undefined
      if (mat && mat !== this.wireMat) mat.visible = !enabled
    })
  }

  protected start(): void {
    this.fx.scene.add(this.group)
    this.fx.add(this)
    activeFx.add(this)
    if (isWireframeOn()) this.setWireframe(true)
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
