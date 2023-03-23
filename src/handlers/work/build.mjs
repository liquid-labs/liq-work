import { doBuild, getBuildEndpointParams } from './_lib/build-lib'

const { help, method, parameters } = getBuildEndpointParams({ workDesc : 'indicated' })

const path = ['work', ':workKey', 'build']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doBuild({ app, cache, model, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
