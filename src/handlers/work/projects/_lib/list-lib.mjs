import { commonOutputParams, formatOutput } from '@liquid-labs/liq-handlers-lib'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WorkDB } from '../../_lib/work-db'

const allFields = ['name', 'private']
const defaultFields = allFields

const mdFormatter = (issues, title) => `# ${title}\n\n${issues.map((i) => `- __${i.name}__:\n  - private: ${i.private}`).join('\n')}\n`

const terminalFormatter = (issues) => issues.map((i) => `<em>${i.name}<rst>:\n  - private: <code>${i.private}<rst>`).join('\n')

const textFormatter = (issues) => issues.map((i) => `${i.name}:\n  - private: ${i.private}`).join('\n')

const doListProjects = async({ app, cache, model, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()

  const { browseEach = false } = req.vars

  const workDB = new WorkDB({ app })
  const workData = await workDB.getData(workKey)

  if (browseEach === true) {
    for (const issue of workData.projects) {
      const projectFQN = issue.name
      tryExec(`open 'https://github.com/${projectFQN}'`)
    }
  }

  formatOutput({
    basicTitle : `${workKey} Projects`,
    data       : workData.projects,
    allFields,
    defaultFields,
    mdFormatter,
    terminalFormatter,
    textFormatter,
    reporter,
    req,
    res,
    ...req.vars
  })
}

const getListProjectsEndpointParameters = ({ workDesc }) => {
  const parameters = [
    {
      name        : 'browseEach',
      isBoolean   : true,
      description : 'Will attempt to open a browser window for each issues in the list.'
    },
    ...commonOutputParams()
  ]
  Object.freeze(parameters)

  return {
    help : {
      name        : 'Work projects list',
      summary     : `List the projects associated with the ${workDesc} unit of work.`,
      description : `List the projects associated with the ${workDesc} unit of work.`
    },
    method : 'get',
    parameters
  }
}

export { doListProjects, getListProjectsEndpointParameters }
