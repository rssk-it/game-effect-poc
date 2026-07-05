import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial } from '../fxmaterial'
import type { FxManager } from '../particles'
import { MeshFx } from '../meshfx'

export interface RisingRingsOptions {
  count?: number
  scale?: number
  color?: THREE.ColorRepresentation
  /** リング1枚が昇りきるまでの秒数 */
  riseTime?: number
  height?: number
}

/** ルーン刻印の帯メッシュが体に沿って昇っていくバフ・オーラ演出。 */
export class RisingRings extends MeshFx {
  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: RisingRingsOptions = {}) {
    super(fx)
    const { count = 3, scale = 1.7, color = 0xffb54d, riseTime = 0.9, height = 2.8 } = o

    this.group.position.copy(pos)
    this.start()

    for (let i = 0; i < count; i++) {
      const mat = new FxMaterial({
        map: assets.tex.runeBand,
        color,
        edgeColor: 0xffffff,
        scroll: [0.25 * (i % 2 === 0 ? 1 : -1), 0],
        dissolveSoft: 0.3,
        fadeTop: 0.3,
        fadeBottom: 0.3,
        opacity: 0,
      })
      const mesh = this.addMesh(assets.geo.auraBand, mat, 7)
      mesh.position.y = 0.1
      mesh.scale.setScalar(scale * 1.25)

      // 時間差で: 出現 → 昇りながら収束 → ディゾルブ
      gsap.delayedCall(i * 0.24, () => {
        mat.opacity2 = 1
        gsap.to(mesh.position, { y: height, duration: riseTime, ease: 'power1.out' })
        gsap.to(mesh.scale, {
          x: scale * 0.5,
          y: scale * 0.5,
          z: scale * 0.5,
          duration: riseTime,
          ease: 'power1.out',
        })
        gsap.to(mat, { dissolve: 1, duration: riseTime * 0.6, ease: 'power1.in', delay: riseTime * 0.4 })
      })
    }
    gsap.delayedCall(count * 0.24 + riseTime + 0.1, () => this.kill())
  }

  protected onUpdate(dt: number): void {
    for (const mesh of this.meshes) mesh.rotation.y += 1.6 * dt
  }
}
