export const STAGE_REV_PRESETS = [
  { label: 'Rev A', longestEdge: 1500 },
  { label: 'Rev B', longestEdge: 3000 },
  { label: 'Rev C', longestEdge: 6000 },
] as const;

export const DEADLINE_TARGETS = [
  { label: 'Local', pool: 'local' },
  { label: 'Deadline Local', pool: 'deadline-local' },
  { label: 'Deadline Cloud', pool: 'deadline-cloud' },
] as const;

export const ASPECT_RATIOS = [
  { label: '16:9', width: 3840, height: 2160 },
  { label: '4:3', width: 4000, height: 3000 },
  { label: '3:2', width: 4500, height: 3000 },
  { label: '2:1', width: 4096, height: 2048 },
  { label: '1:1', width: 3000, height: 3000 },
  { label: '9:16', width: 2160, height: 3840 },
  { label: '21:9', width: 5040, height: 2160 },
  { label: '2.39:1', width: 5040, height: 2109 },
] as const;

export const TONE_MAPPING_PRESETS = [
  { label: 'WARM', delta: { whiteBalance: 5500, saturation: 1.1, contrast: 1.05 } },
  { label: 'COOL', delta: { whiteBalance: 7500, saturation: 0.95, contrast: 1 } },
  { label: 'NEUTRAL', delta: { whiteBalance: 6500, saturation: 1, contrast: 1 } },
  { label: 'HI-CON', delta: { whiteBalance: 6500, saturation: 1.2, contrast: 1.3 } },
  { label: 'DESAT', delta: { whiteBalance: 6500, saturation: 0.5, contrast: 1 } },
] as const;

export const LIGHT_SETUP_PRESETS = [
  { label: 'DAY', delta: { skyType: 'Corona Sun + Sky', skyIntensity: 1, sunAngle: 45 } },
  { label: 'NIGHT', delta: { skyType: 'HDRI', skyIntensity: 0.3, iblMap: 'city_night_01.hdr' } },
  { label: 'OVERCAST', delta: { skyType: 'HDRI', skyIntensity: 0.7, iblMap: 'overcast_01.hdr' } },
  { label: 'SUNSET', delta: { skyType: 'Corona Sun + Sky', skyIntensity: 0.8, sunAngle: 10 } },
  { label: 'STUDIO', delta: { skyType: 'None', skyIntensity: 0, groundPlane: false } },
] as const;

export const OUTPUT_FORMATS = ['JPG', 'PNG', 'EXR', 'CXR'] as const;
