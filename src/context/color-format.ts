import { createContext, useContext } from 'react'
import type { ColorFormat } from '@/lib/color'

/* The color notation the inspector's CSS panel currently renders colors in.
   Provided by InspectorPanel's toggle; consumed by the declaration rows. */
export const ColorFormatContext = createContext<ColorFormat>('hex')

export const useColorFormat = (): ColorFormat => useContext(ColorFormatContext)
