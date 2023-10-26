import { getPauseEndpointParams, doPause } from './_lib/pause-lib'

const { help, method, parameters } = getPauseEndpointParams({ descIntro : 'implied' })

const path = ['work', 'pause']

const func = ({ app, cache, reporter }) => async(req, res) => {
  await doPause({ app, cache, reporter, req, res })
}

export { func, help, method, parameters, path }
