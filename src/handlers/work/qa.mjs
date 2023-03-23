import { doQA, getQAEndpointParams } from './_lib/qa-lib'

const { help, method, parameters } = getQAEndpointParams({ workDesc : 'indicated' })

const path = ['work', ':workKey', 'qa']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doQA({ app, cache, model, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
