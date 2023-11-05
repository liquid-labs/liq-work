import { doListProjects, getListProjectsEndpointParameters } from './_lib/list-lib'

const { help, method, parameters } = getListProjectsEndpointParameters({
  alternateTo: {
    altId: '/work/projects/list',
    variation: 'explicitly name the unit of work'
  },
  workDesc : 'named' 
})

const path = ['work', ':workKey', 'projects', 'list']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doListProjects({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
