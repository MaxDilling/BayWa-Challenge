// windgap/models/identity.py
import { correlation, pairs, type Frame } from '../frame'
import { gaussianPrediction, type Explanation, type WindModel } from './base'

export class Identity implements WindModel {
  private sigma: number
  private r = NaN
  private nTrain = 0

  constructor(sigma = 1.0) {
    this.sigma = sigma
  }

  fit(target: Float64Array, refs: Frame) {
    this.r = correlation(target, refs.cols[0])
    this.nTrain = pairs(target, refs.cols[0])[0].length
    return this
  }

  predict(refs: Frame) {
    return gaussianPrediction(refs.cols[0], this.sigma)
  }

  explain(): Explanation {
    return {
      summary:
        'The missing wind speed is taken to be the reference wind speed. ' +
        'It is the simplest possible assumption and the baseline every other method must beat.',
      formula: '\\hat{v}_t = v_r',
      params: { sigma: this.sigma },
      diagnostics: { r: this.r, n_train: this.nTrain },
    }
  }
}
