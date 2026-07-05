import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial } from '../fxmaterial'
import type { FxManager } from '../particles'
import { MeshFx } from '../meshfx'

/** 地割れの種類。それぞれ専用の image-gen テクスチャを使う（tint流用はしない）。 */
export type CrackKind = 'magma' | 'ice' | 'void' | 'stone'

interface CrackDef {
  texKey: keyof FxAssets['tex']
  color: number
  edgeColor: number
  /** 脈動の強さ（マグマは強く、氷はほぼ無し） */
  pulse: number
}

const CRACK_KINDS: Record<CrackKind, CrackDef> = {
  magma: { texKey: 'groundCrack', color: 0xffb45e, edgeColor: 0xff5a1a, pulse: 0.12 },
  ice: { texKey: 'iceCrack', color: 0xe8f6ff, edgeColor: 0x8fd4ff, pulse: 0.04 },
  void: { texKey: 'voidCrack', color: 0xe6d4ff, edgeColor: 0x8a3cff, pulse: 0.1 },
  stone: { texKey: 'stoneCrack', color: 0xdfe8ff, edgeColor: 0x9fb8e8, pulse: 0.06 },
}

export interface GroundCrackOptions {
  /** 地割れの種類（専用テクスチャに切替）。省略時 magma */
  kind?: CrackKind
  scale?: number
  duration?: number
  color?: THREE.ColorRepresentation
}

/** 地割れ・地面デカール。出現 → 脈動 → ディゾルブ。種類ごとに専用テクスチャ。 */
export class GroundCrack extends MeshFx {
  private mat: FxMaterial
  private env = { v: 0 }
  private pulse: number

  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: GroundCrackOptions = {}) {
    super(fx)
    const def = CRACK_KINDS[o.kind ?? 'magma']
    const { scale = 5, duration = 1.6, color = def.color } = o
    this.pulse = def.pulse

    this.mat = new FxMaterial({
      map: assets.tex[def.texKey],
      color,
      edgeColor: def.edgeColor,
      opacity: 0,
      dissolveSoft: 0.16,
      radialFade: 0.55,
    })
    const mesh = this.addMesh(this.ownGeometry(new THREE.PlaneGeometry(1, 1)), this.mat, 4)
    mesh.rotation.x = -Math.PI / 2

    this.group.position.set(pos.x, 0.07, pos.z)
    this.group.scale.setScalar(scale * 0.8)
    this.start()

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.env, { v: 1, duration: 0.12, ease: 'power1.out' }, 0)
    tl.to(this.group.scale, { x: scale, y: scale, z: scale, duration: 0.25, ease: 'power3.out' }, 0)
    tl.to(this.mat, { dissolve: 1, duration: duration * 0.5, ease: 'power2.in' }, duration * 0.5)
  }

  protected onUpdate(): void {
    // 発光の脈動（エンベロープ × 種類ごとの揺らぎ量）
    this.mat.opacity2 = this.env.v * (1 - this.pulse + this.pulse * Math.sin(this.t * 14))
  }
}
