import { doClean, getCleanEndpointParameters } from './_lib/clean-lib'

const { help, method, parameters } = getCleanEndpointParameters({
  alternateTo: {
    altId: '/work/clean',
    variation: 'explicitly name the unit of work'
  },
  workDesc : 'named' 
})

const path = ['work', ':workKey', 'clean']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const { workKey } = req.vars

  doClean({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
