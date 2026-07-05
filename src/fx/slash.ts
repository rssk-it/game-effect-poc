import * as THREE from 'three'
import gsap from 'gsap'

/**
 * 斬撃アーク。生成テクスチャ(黒背景)を加算合成スプライトとして表示し、
 * 回転させながらスケールイン+フェードアウトする。
 */
export function slashArc(
  scene: THREE.Scene,
  slashTexture: THREE.Texture,
  pos: THREE.Vector3,
  opts: { angle?: number; scale?: number; mirror?: boolean; color?: THREE.ColorRepresentation; duration?: number } = {},
): void {
  const { angle = 0, scale = 3.4, mirror = false, color = 0xffffff, duration = 0.26 } = opts
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: slashTexture,
      color,
      rotation: angle,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  sprite.position.copy(pos)
  sprite.scale.set(scale * 0.55 * (mirror ? -1 : 1), scale * 0.55, 1)
  sprite.renderOrder = 7
  scene.add(sprite)

  gsap.to(sprite.scale, {
    x: scale * (mirror ? -1 : 1),
    y: scale,
    duration: duration * 0.55,
    ease: 'power4.out',
  })
  gsap.to(sprite.material, { rotation: angle + (mirror ? 0.55 : -0.55), duration, ease: 'power2.out' })
  gsap.to(sprite.material, {
    opacity: 0,
    duration,
    delay: duration * 0.25,
    ease: 'power1.in',
    onComplete: () => {
      scene.remove(sprite)
      sprite.material.dispose()
    },
  })
}
