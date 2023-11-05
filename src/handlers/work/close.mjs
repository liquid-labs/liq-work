import { doClose, getCloseEndpointParameters } from './_lib/close-lib'

const { help, method, parameters } = getCloseEndpointParameters({
  alternateTo : {
    altId     : '/work/close',
    variation : 'explicitly name the unit of work'
  },
  workDesc : 'named'
})

const path = ['work', ':workKey', 'close']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const { workKey } = req.vars

  doClose({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
