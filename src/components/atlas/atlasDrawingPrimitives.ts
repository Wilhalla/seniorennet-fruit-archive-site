import { clamp, colorMix, macroAtlasUnitCoordinate, rawAtlasUnitCoordinate, type ScreenPoint } from '../../lib/archiveAtlas'

export type AtlasRect = { width: number; height: number }
export type AtlasCategoryBounds = Map<string, { minX: number; maxX: number; minY: number; maxY: number }>

export function macroAtlasCoordinate(categoryId: string, rawX: number, rawY: number, rect: AtlasRect, categoryBounds: AtlasCategoryBounds): ScreenPoint {
  const unit = macroAtlasUnitCoordinate(categoryId, rawX, rawY, categoryBounds)
  return { x: unit.x * rect.width, y: unit.y * rect.height }
}

export function rawAtlasCoordinate(rawX: number, rawY: number, rect: AtlasRect): ScreenPoint {
  const unit = rawAtlasUnitCoordinate(rawX, rawY)
  return { x: unit.x * rect.width, y: unit.y * rect.height }
}

export function screenFromAtlasPoint(point: ScreenPoint, scale: number, pan: ScreenPoint): ScreenPoint {
  return { x: point.x * scale + pan.x, y: point.y * scale + pan.y }
}

export function clusterRadiusFor(count: number) {
  return clamp(12 + Math.sqrt(count) * 2.2, 18, 56)
}

export function drawHexCell(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.beginPath()
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 6 + i * Math.PI / 3
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    if (i === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
  }
  context.closePath()
}

export function drawTechNode(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, selected = false) {
  const half = size / 2
  context.save()
  context.translate(x, y)
  context.rotate(Math.PI / 4)
  context.fillStyle = selected ? colorMix(color, 0.22) : 'rgba(253, 252, 252, 0.86)'
  context.strokeStyle = colorMix(color, selected ? 0.92 : 0.62)
  context.lineWidth = selected ? 2 : 1.35
  context.beginPath()
  context.rect(-half, -half, size, size)
  context.fill()
  context.stroke()
  context.restore()

  context.strokeStyle = colorMix(color, selected ? 0.72 : 0.38)
  context.lineWidth = selected ? 1.2 : 0.8
  context.beginPath()
  context.moveTo(x - size * 1.08, y)
  context.lineTo(x - half * 0.78, y)
  context.moveTo(x + half * 0.78, y)
  context.lineTo(x + size * 1.08, y)
  context.moveTo(x, y - size * 1.08)
  context.lineTo(x, y - half * 0.78)
  context.moveTo(x, y + half * 0.78)
  context.lineTo(x, y + size * 1.08)
  context.stroke()
}
