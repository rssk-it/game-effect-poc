import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Blender 製エフェクトメッシュ + image-gen 製テクスチャの束。 */
export interface FxAssets {
  geo: {
    slashTrail: THREE.BufferGeometry
    vortex: THREE.BufferGeometry
    shockwave: THREE.BufferGeometry
    pillar: THREE.BufferGeometry
  }
  tex: {
    fireNoise: THREE.Texture
    slashStreak: THREE.Texture
    shockwaveRing: THREE.Texture
    groundCrack: THREE.Texture
    energyStream: THREE.Texture
  }
}

async function loadGeometry(loader: GLTFLoader, url: string): Promise<THREE.BufferGeometry> {
  const gltf = await loader.loadAsync(url)
  let geo: THREE.BufferGeometry | null = null
  gltf.scene.traverse((obj) => {
    if (!geo && (obj as THREE.Mesh).isMesh) geo = (obj as THREE.Mesh).geometry
  })
  if (!geo) throw new Error(`メッシュが見つかりません: ${url}`)
  return geo
}

function loadFxTexture(loader: THREE.TextureLoader, url: string, tile: boolean): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    if (tile) {
      // AI生成テクスチャの継ぎ目をミラーラップで隠す
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping
    } else {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    }
    return tex
  })
}

export async function loadFxAssets(): Promise<FxAssets> {
  const gltfLoader = new GLTFLoader()
  const texLoader = new THREE.TextureLoader()

  const [slashTrail, vortex, shockwave, pillar, fireNoise, slashStreak, shockwaveRing, groundCrack, energyStream] =
    await Promise.all([
      loadGeometry(gltfLoader, '/assets/models/slash-trail.glb'),
      loadGeometry(gltfLoader, '/assets/models/vortex.glb'),
      loadGeometry(gltfLoader, '/assets/models/shockwave.glb'),
      loadGeometry(gltfLoader, '/assets/models/pillar.glb'),
      loadFxTexture(texLoader, '/assets/fx/fire-noise.png', true),
      loadFxTexture(texLoader, '/assets/fx/slash-streak.png', false),
      loadFxTexture(texLoader, '/assets/fx/shockwave-ring.png', false),
      loadFxTexture(texLoader, '/assets/fx/ground-crack.png', false),
      loadFxTexture(texLoader, '/assets/fx/energy-stream.png', true),
    ])

  return {
    geo: { slashTrail, vortex, shockwave, pillar },
    tex: { fireNoise, slashStreak, shockwaveRing, groundCrack, energyStream },
  }
}
