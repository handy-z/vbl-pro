export interface CrosshairConfig {
  enabled: boolean
  color: string
  offset: CrosshairOffset
  scale: number
}

export interface CrosshairOffset {
  x: number
  y: number
}

export declare function isOverlayRunning(): boolean

export declare function startOverlay(image: Buffer, config: CrosshairConfig, targetProcessName?: string | undefined | null): void

export declare function stopOverlay(): void
