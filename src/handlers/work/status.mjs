import * as fsPath from 'node:path'

import createError from 'http-errors'

import { compareLocalAndRemoteBranch, determineOriginAndMain, workBranchName } from '@liquid-labs/git-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'

import { WORKSPACE } from './_lib/constants'
import { WorkDB } from './_lib/work-db'

const help = {
  name        : 'Work status',
  summary     : 'Reports on the status of a unit of work.',
  description : `Checks the status of a unit of work branches, issues, and pull requests.

See also 'work detail' for basic static information.`
}

const method = 'get'
const path = ['work', ':workKey', 'status']
const parameters = []
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  const workDB = new WorkDB({ app, authToken, reporter })

  const report = {}

  const workUnit = workDB.getData(workKey)
  if (workUnit === undefined) {
    throw createError.NotFound(`No such unit of work '${workKey}' found in Work DB.`)
  }

  const workBranch = workBranchName({ primaryIssueID: workUnit.issues[0].id })

  for (const { name: projectFQN, private: isPrivate } of workUnit.projects) {
    reporter.push(`Checking status of <em>${projectFQN}<rst>...`)

    const projectStatus = {}
    report[projectFQN] = projectStatus

    const [org, project] = projectFQN.split('/')
    const projectPath = fsPath.join(app.liq.playground(), org, project)

    let remote
    if (isPrivate === true) { ([remote] = determineOriginAndMain({ projectPath, reporter })) }
    else { remote = WORKSPACE }

    const syncStatus = compareLocalAndRemoteBranch({ branch: workBranch, remote, projectPath })
    projectStatus.syncStatus = syncStatus
  }

  httpSmartResponse({ data : report, msg : reporter.taskReport.join('\n'), req, res })
}

export { func, help, parameters, path, method }
