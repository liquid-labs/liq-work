import createError from 'http-errors'

import { releaseIssues } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'

import { commonIssuesParameters } from '../_lib/common-issues-parameters'
import { WorkDB } from '../_lib/work-db'

const help = {
  name        : 'Work issues remove',
  summary     : 'Remove issues from a unit of work.',
  description : 'Removes issues from the indicated unit of work.'
}

const method = 'delete'
const path = ['work', ':workKey', 'issues', 'remove']

const parameters = [
  {
    name        : 'comment',
    description : 'Comment to add to the issues as they are removed. A default comment will be generated if none is provided. Pass an empty string to suppress leaving a comment.'
  },
  {
    name        : 'noUnassign',
    isBoolean   : true,
    description : 'Setting `noUnassign` to true maintains the issue assignments rather than the default behavior of unassigning the issue.'
  },
  {
    name        : 'noUnlabel',
    isBoolean   : true,
    description : "Setting `noUnlabel` to true keeps the 'claim label' on the issue rather than the default behavior of removing it."
  },
  ...commonIssuesParameters
]
const issueOptionsFunc = ({ app, workKey }) => {
  const workDB = new WorkDB({ app })
  return workDB.getIssueKeys(workKey)
}
parameters.find((p) => p.name === 'issues').optionsFunc = issueOptionsFunc
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  let { comment, issues, noUnassign, noUnlabel, workKey } = req.vars

  const workDB = new WorkDB({ app, reporter })
  const workData = workDB.getData(workKey)
  if (workData === undefined) {
    throw createError.NotFound(`No such active unit of work '${workKey}'.`)
  }

  // normalize the issue spec; add default project to issues
  const primaryProject = workData.projects[0].name
  issues = issues.map((i) => i.match(/^\d+$/) ? primaryProject + '/' + i : i)

  const credDB = new CredentialsDB({ app, cache, reporter })
  const authToken = credDB.getToken(purposes.GITHUB_API)
  console.log('issues:', issues) // DEBUG

  await releaseIssues({ authToken, comment, issues, noUnassign, noUnlabel, reporter })

  const updatedWorkData = workDB.removeIssues({ workKey, issues })

  httpSmartResponse({
    data : updatedWorkData,
    msg  : `Removed issues '<em>${issues.join("<rst>', '<em>")}<rst>' from unit of work '<em>${workKey}<rst>'.`,
    req,
    res
  })
}

export { func, help, parameters, path, method }
