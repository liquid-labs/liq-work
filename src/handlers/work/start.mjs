import createError from 'http-errors'

import {
  claimIssues,
  createIssue,
  determineGitHubLogin,
  getGitHubOrgAndProjectBasename,
  verifyIssuesAvailable
} from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { getPackageJSON } from '@liquid-labs/npm-toolkit'

import { commonAssignParameters } from './_lib/common-assign-parameters'
import { commonAddProjectParameters } from './_lib/common-add-project-parameters'
import { WorkDB } from './_lib/work-db'

const help = {
  name        : 'Work start',
  summary     : 'Creates a new unit of work.',
  description : 'Creates a new unit of work involving the designated projects. By default, the local development copy of any project which is a dependency of another is linked the dependent project unless `noLink` is specified.'
}

const method = 'post'
const path = ['work', 'start']
const parameters = [
  {
    name        : 'issueBug',
    isBoolean   : true,
    description : "Labels the created issue as a 'bug' rather than the default 'enhancement'. Only valid when 'createIssues' is set."
  },
  {
    name        : 'issueDeliverables',
    description : "A list of newline or a double semi-colon (';;') seperated deliverables items. Only valid when 'createIssue' is set."
  },
  {
    name        : 'issueNotes',
    description : "Notes to include in the issue body. Only valid when 'createIssue' is set."
  },
  {
    name        : 'issueOverview',
    description : "The overview text to use when creating an issue. Only valid if 'createIssue' is set."
  },
  {
    name        : 'issueTitle',
    description : "Creates an issue with the given title. Requires 'issueOverview' and 'issueDeliverables' also be set."
  },
  {
    name         : 'projects',
    isMultivalue : true,
    description  : 'The project(s) to include in the new unit of work. If none are specified, then will guess the current implied project based on the client working directory.',
    optionsFunc  : async({ app }) => await app.ext._liqProjects.playgroundMonitor.listProjects()
  },
  ...commonAddProjectParameters(),
  ...commonAssignParameters()
]
Object.freeze(parameters)

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const {
    assignee,
    comment,
    issueBug,
    issueDeliverables,
    issueNotes,
    issueOverview,
    issueTitle,
    noAutoAssign = false
  } = req.vars
  let { issues = [], projects } = req.vars

  if (issues.length === 0 && issueTitle === undefined) {
    throw createError.BadRequest("Must provides 'issues' or create an issue with 'issueTitle', etc.")
  }

  if (issueTitle !== undefined && (issueDeliverables === undefined || issueOverview === undefined)) {
    throw createError.BadRequest("Parameters 'issueOverview' and 'issueDeliverables' must be provided when 'issueTitle' is set.")
  }
  else if (issueTitle === undefined
    && (issueBug !== undefined || issueDeliverables !== undefined || issueOverview !== undefined || issueNotes !== undefined)) {
    throw createError.BadRequest("Parameters 'issueBug', 'issueOverview', 'issueDeliverables', and 'issueNotes' are only valid when 'issueTitle' is set.")
  }

  // First, let's process projects. If nothing specified, assume the current, implied project.
  if (projects === undefined) {
    const currPkgJSON = await getPackageJSON({ pkgDir : req.get('X-CWD') })
    const currProject = currPkgJSON.name
    projects = [currProject]
  }
  // Now, make sure all project specs are valid.
  for (const project of projects) {
    if (await app.ext._liqProjects.playgroundMonitor.getProjectData(project) === undefined) {
      throw createError.BadRequest(`No such local project '${project}'. Do you need to import it?`)
    }
  }

  // technically, we dont't always need this, but we usually do; this is the data for the 'primary' project
  const { packageJSON } = await app.ext._liqProjects.playgroundMonitor.getProjectData(projects[0])
  const { org: ghOrg, projectBasename } = getGitHubOrgAndProjectBasename({ packageJSON })

  const credDB = app.ext.credentialsDB
  const authToken = await credDB.getToken('GITHUB_API')

  if (issueTitle !== undefined) {
    const labels = []
    if (issueBug === true) {
      labels.push('bug')
    }
    else {
      labels.push('enhancement')
    }

    const deliverables = issueDeliverables.split(/(?:\n|;;)/)
    const deliverablesText = '- [ ] ' + deliverables.join('\n- [ ] ')

    let issueBody = `## Overview
${issueOverview}

## Deliverables

${deliverablesText}`

    if (issueNotes !== undefined) {
      issueBody += `

## Notes

${issueNotes}`
    } // if (notes)

    const projectFQN = ghOrg + '/' + projectBasename

    const { number } = await createIssue({ authToken, projectFQN, title : issueTitle, body : issueBody, labels, reporter })
    issues.unshift(number + '')
  }// if (createIssue)

  // Normalize issues as '<org>/<project>/<issue number>'
  issues = await Promise.all(issues.map(async(i) => {
    if (i.match(/^\d+$/)) {
      return ghOrg + '/' + projectBasename + '/' + i
    }
    return i
  }))

  const githubLogin = (await determineGitHubLogin({ authToken })).login
  // TODO: this should be an integration hook point
  await verifyIssuesAvailable({ authToken, availableFor : githubLogin, issues, noAutoAssign, reporter })
  // TODO: this should be an integration hook point
  await claimIssues({ assignee, authToken, comment, issues, reporter })

  const workDB = new WorkDB({ app, authToken, reporter })
  const workData = await workDB.startWork({ app, issues, projects, reporter })

  reporter.push(`Started work '<em>${workData.description}<rst>'.`)

  httpSmartResponse({ data : workData, msg : reporter.taskReport.join('\n'), req, res })
}

export { func, help, parameters, path, method }
