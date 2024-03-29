import { doQA, getQAEndpointParams } from './_lib/qa-lib'

const { help, method, parameters } = getQAEndpointParams({
  alternateTo : {
    altId     : '/work/qa',
    variation : 'explicitly name the unit of work'
  },
  workDesc : 'indicated'
})

const path = ['work', ':workKey', 'qa']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doQA({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
