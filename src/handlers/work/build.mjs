import { doBuild, getBuildEndpointParams } from './_lib/build-lib'

const { help, method, parameters } = getBuildEndpointParams({
  alternateTo: {
    altId: '/work/build',
    variation: 'explicitly name the unit of work'
  },
  workDesc : 'indicated',
})

const path = ['work', ':workKey', 'build']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doBuild({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
