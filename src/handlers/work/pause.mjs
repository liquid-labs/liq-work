import { getPauseEndpointParams, doPause } from './_lib/pause-lib'

const { help, method, parameters } = getPauseEndpointParams({ desc : 'named' })

const path = ['work', ':workKey', 'pause']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doPause({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
