import { doStatus, getStatusEndpointParameters } from './_lib/status-lib'

const { help, method, parameters } = getStatusEndpointParameters({ workDesc : 'indicated' })

const path = ['work', ':workKey', 'status']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const { workKey } = req.vars

  doStatus({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
