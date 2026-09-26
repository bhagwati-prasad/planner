import { select } from 'd3'
import * as THREE from 'three'
import merge from 'lodash/merge'

export const picked = select('#root')
export const geometry = typeof THREE.BoxGeometry
export { merge }
