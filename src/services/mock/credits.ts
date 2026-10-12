// Attribution for third-party sample assets used by the demo seed data.
const KHRONOS_TREE = 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models'

export const MODEL_CREDITS = [
  { name: 'Glam Velvet Sofa', folder: 'GlamVelvetSofa' },
  { name: 'Sheen Wood Leather Sofa', folder: 'SheenWoodLeatherSofa' },
  { name: 'Sheen Chair', folder: 'SheenChair' },
  { name: 'Chair Damask Purplegold', folder: 'ChairDamaskPurplegold' },
  { name: 'Anisotropy Barn Lamp', folder: 'AnisotropyBarnLamp' },
  { name: 'Lights Punctual Lamp', folder: 'LightsPunctualLamp' },
].map((m) => ({
  name: m.name,
  license: 'CC BY 4.0',
  source: 'Khronos glTF Sample Assets',
  url: `${KHRONOS_TREE}/${m.folder}`,
  licenseUrl: `${KHRONOS_TREE}/${m.folder}/LICENSE.md`,
}))

export const PHOTO_CREDIT = {
  source: 'Unsplash',
  license: 'Unsplash License',
  url: 'https://unsplash.com/license',
}
