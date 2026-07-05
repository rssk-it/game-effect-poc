import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Blender 製エフェクトメッシュ + image-gen 製テクスチャの束。 */
export interface FxAssets {
  geo: {
    slashTrail: THREE.BufferGeometry
    vortex: THREE.BufferGeometry
    /** 物理衝撃波用のドーナツ波（属性ごとに専用リングがあるので他属性では使わない） */
    shockwave: THREE.BufferGeometry
    pillar: THREE.BufferGeometry
    flameRing: THREE.BufferGeometry
    iceRing: THREE.BufferGeometry
    holyRing: THREE.BufferGeometry
    voidRing: THREE.BufferGeometry
    sparkRing: THREE.BufferGeometry
    auraBand: THREE.BufferGeometry
  }
  tex: {
    fireNoise: THREE.Texture
    slashStreak: THREE.Texture
    shockwaveRing: THREE.Texture
    groundCrack: THREE.Texture
    energyStream: THREE.Texture
    fireRing: THREE.Texture
    frostBurst: THREE.Texture
    iceCrack: THREE.Texture
    electricRing: THREE.Texture
    holyRing: THREE.Texture
    voidRing: THREE.Texture
    voidCrack: THREE.Texture
    stoneCrack: THREE.Texture
    runeBand: THREE.Texture
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

  const geoDefs: Array<[keyof FxAssets['geo'], string]> = [
    ['slashTrail', 'slash-trail.glb'],
    ['vortex', 'vortex.glb'],
    ['shockwave', 'shockwave.glb'],
    ['pillar', 'pillar.glb'],
    ['flameRing', 'flame-ring.glb'],
    ['iceRing', 'ice-ring.glb'],
    ['holyRing', 'holy-ring.glb'],
    ['voidRing', 'void-ring.glb'],
    ['sparkRing', 'spark-ring.glb'],
    ['auraBand', 'aura-band.glb'],
  ]
  const texDefs: Array<[keyof FxAssets['tex'], string, boolean]> = [
    ['fireNoise', 'fire-noise.png', true],
    ['slashStreak', 'slash-streak.png', false],
    ['shockwaveRing', 'shockwave-ring.png', false],
    ['groundCrack', 'ground-crack.png', false],
    ['energyStream', 'energy-stream.png', true],
    ['fireRing', 'fire-ring.png', false],
    ['frostBurst', 'frost-burst.png', false],
    ['iceCrack', 'ice-crack.png', false],
    ['electricRing', 'electric-ring.png', false],
    ['holyRing', 'holy-ring.png', false],
    ['voidRing', 'void-ring.png', false],
    ['voidCrack', 'void-crack.png', false],
    ['stoneCrack', 'stone-crack.png', false],
    ['runeBand', 'rune-band.png', true],
  ]

  const [geos, texs] = await Promise.all([
    Promise.all(geoDefs.map(([, file]) => loadGeometry(gltfLoader, `/assets/models/${file}`))),
    Promise.all(texDefs.map(([, file, tile]) => loadFxTexture(texLoader, `/assets/fx/${file}`, tile))),
  ])

  const geo = Object.fromEntries(geoDefs.map(([key], i) => [key, geos[i]])) as FxAssets['geo']
  const tex = Object.fromEntries(texDefs.map(([key], i) => [key, texs[i]])) as FxAssets['tex']
  return { geo, tex }
}
