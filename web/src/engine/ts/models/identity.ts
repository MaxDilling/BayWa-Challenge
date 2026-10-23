// windgap/models/identity.py
import { correlation, pairs, type Frame } from '../frame'
import { calibrate, gaussianPrediction, type Errors, type Explanation, type WindModel } from './base'

export class Identity implements WindModel {
  errors!: Errors
  private r = NaN
  private nTrain = 0

  fit(target: Float64Array, refs: Frame) {
    const [x] = refs.cols
    this.r = correlation(x, target)
    this.nTrain = pairs(target, x)[0].length
    this.errors = calibrate(x, target, () => (v) => v)
    return this
  }

  predict(refs: Frame) {
    const [x] = refs.cols
    return gaussianPrediction(x, this.errors.sigma(x))
  }

  explain(): Explanation {
    return {
      summary:
        'The missing wind speed is taken to be the reference wind speed. ' +
        'It is the simplest possible assumption and the baseline every other method must beat.',
      formula: '\\hat{v}_t = v_r',
      params: {},
      diagnostics: {
        r: this.r,
        n_train: this.nTrain,
        sigma_0: this.errors.sigma0,
        sigma_slope: this.errors.sigmaSlope,
        error_memory_h: this.errors.memoryH,
      },
    }
  }
}
