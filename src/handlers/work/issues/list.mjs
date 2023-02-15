import { commonOutputParams, formatOutput } from '@liquid-labs/liq-handlers-lib'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WorkDB } from '../_lib/work-db'

const help = {
  name        : 'Work issues list',
  summary     : 'List work issues.',
  description : 'Lists the issues associated with the indicated unit of work.'
}

const method = 'get'
const path = ['work', ':workKey', 'issues', 'list']
const parameters = [
  {
    name: 'browseEach',
    isBoolean: true,
    description: 'Will attempt to open a browser window for each issues in the list.'
  },
  ...commonOutputParams()
]
Object.freeze(parameters)

const allFields = [ 'id', 'summary' ]
const defaultFields = allFields

const mdFormatter = (issues, title) => `# ${title}\n\n${issues.map((i) => `* __${i.id}: ${i.descirption}`).join('\n')}\n`

const terminalFormatter = (issues) => issues.map((i) => `<em>${i.id}<rst>: ${i.summary}`).join('\n')

const textFormatter = (issues) => issues.map((i) => `${i.id}: ${i.summary}`).join('\n')

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  let { browseEach = false, workKey } = req.vars

  const workDB = new WorkDB({ app })
  const workData = await workDB.getData(workKey)

  if (browseEach === true) {
    for (const issue of workData.issues) {
      const [ org, project, number ] = issue.id.split('/')
      tryExec(`open 'https://github.com/${org}/${project}/issues/${number}'`)
    }
  }

  formatOutput({
    basicTitle: `${workKey} Issues`,
    data : workData.issues,
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

export { func, help, parameters, path, method }
