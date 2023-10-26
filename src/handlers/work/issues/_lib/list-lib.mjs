import { commonOutputParams, formatOutput } from '@liquid-labs/liq-handlers-lib'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WorkDB } from '../../_lib/work-db'

const getIssuesListEndpointParameters = ({ workDesc }) => {
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
      name        : 'Work issues list',
      summary     : `List the ${workDesc} work issues.`,
      description : `Lists the issues associated with the ${workDesc} unit of work.`
    },
    method : 'get',
    parameters
  }
}

const allFields = ['id', 'summary']
const defaultFields = allFields

const mdFormatter = (issues, title) => `# ${title}\n\n${issues.map((i) => `- __${i.id}__: ${i.summary}`).join('\n')}\n`

const terminalFormatter = (issues) => issues.map((i) => `<code>${i.id}<rst>: ${i.summary}`).join('\n')

const textFormatter = (issues) => issues.map((i) => `${i.id}: ${i.summary}`).join('\n')

const doListIssues = async({ app, cache, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()

  const { browseEach = false } = req.vars

  const workDB = new WorkDB({ app })
  const workData = await workDB.getData(workKey)
  console.log('workData:', workData) // DEBUg

  if (browseEach === true) {
    for (const { id } of workData.issues) {
      const [ghOrg, project, number] = id.split('/')

      tryExec(`open 'https://github.com/${ghOrg}/${project}/issues/${number}'`)
    }
  }

  formatOutput({
    basicTitle : `${workKey} issues`,
    data       : workData.issues,
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

export { doListIssues, getIssuesListEndpointParameters }
