import type * as THREE from 'three'
import type { CameraRig } from './camera/rig'
import type { Character } from './scene/character'
import type { Stage } from './scene/stage'
import type { FxManager } from './fx/particles'
import type { FxAssets } from './fx/assets'
import type { Hud } from './ui/hud'

/** シーケンスから触る全要素の束。 */
export interface World {
  scene: THREE.Scene
  rig: CameraRig
  stage: Stage
  fx: FxManager
  hud: Hud
  chars: {
    knight: Character
    tank: Character
    mage: Character
    boss: Character
  }
  tex: {
    slash: THREE.Texture
    magicCircle: THREE.Texture
  }
  /** Blender製メッシュ + image-gen製テクスチャ */
  fxAssets: FxAssets
}
