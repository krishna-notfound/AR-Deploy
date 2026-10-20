// Attribution for third-party sample assets used by the demo seed data. Licences and creators are taken from each
// model's metadata.json in KhronosGroup/glTF-Sample-Assets (CC BY 4.0 requires naming the creator).
const KHRONOS_TREE = 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models'

export const MODEL_CREDITS = [
  { name: 'Glam Velvet Sofa', folder: 'GlamVelvetSofa', license: 'CC BY 4.0', creator: 'Eric Chadwick, Wayfair, LLC' },
  { name: 'Sheen Wood Leather Sofa', folder: 'SheenWoodLeatherSofa', license: 'CC BY 4.0 (improvements); original CC0', creator: 'Eric Chadwick, Darmstadt Graphics Group GmbH (improvements); Fran Calvente (original)' },
  { name: 'Sheen Chair', folder: 'SheenChair', license: 'CC0 1.0', creator: 'Eric Chadwick, Wayfair, LLC' },
  { name: 'Chair Damask Purplegold', folder: 'ChairDamaskPurplegold', license: 'CC BY 4.0', creator: 'Eric Chadwick, Wayfair' },
  { name: 'Anisotropy Barn Lamp', folder: 'AnisotropyBarnLamp', license: 'CC BY 4.0', creator: 'Eric Chadwick, Wayfair, LLC' },
  { name: 'Lights Punctual Lamp', folder: 'LightsPunctualLamp', license: 'CC BY 4.0', creator: 'DGG' },
].map((m) => ({
  name: m.name,
  license: m.license,
  creator: m.creator,
  source: `by ${m.creator}, Khronos glTF Sample Assets`,
  url: `${KHRONOS_TREE}/${m.folder}`,
  licenseUrl: `${KHRONOS_TREE}/${m.folder}/LICENSE.md`,
}))

export const PHOTO_CREDIT = {
  source: 'Unsplash',
  license: 'Unsplash License',
  url: 'https://unsplash.com/license',
}
