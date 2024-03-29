import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'
import {
  claimIssues,
  createIssue,
  determineGitHubLogin,
  getGitHubOrgAndProjectBasename,
  verifyIssuesAvailable
} from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { getPackageJSON } from '@liquid-labs/npm-toolkit'
import { tryExecAsync } from '@liquid-labs/shell-toolkit'

import { commonAssignParameters } from './common-assign-parameters'
import { commonAddProjectParameters } from './common-add-project-parameters'
import { doSave } from './save-lib'
import { doSubmit } from './submit-lib'
import { WorkDB } from './work-db'

const doStart = async({
  app,
  assignee,
  cache,
  comment,
  issueBug,
  issueDeliverables,
  issueNotes,
  issueOverview,
  issues,
  issueTitle,
  noAutoAssign,
  noOpenIssue = false,
  projects,
  reporter,
  req,
  res,
  submit
}) => {
  reporter = reporter.isolate()

  if (issues.length === 0 && issueTitle === undefined) {
    throw createError.BadRequest("Must provides 'issues' or create an issue with 'issueTitle', etc.")
  }

  if (issueTitle === undefined
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

  if (submit === true && projects.length > 1) {
    throw createError.BadRequest("Inline 'submit' only valid when submitting a single project.")
  }

  // technically, we dont't always need this, but we usually do; this is the data for the 'primary' project
  const { packageJSON } = await app.ext._liqProjects.playgroundMonitor.getProjectData(projects[0])
  const { org: ghOrg, projectBasename } = getGitHubOrgAndProjectBasename({ packageJSON })

  const credDB = app.ext.credentialsDB
  const authToken = await credDB.getToken('GITHUB_API')

  let issueURL
  if (issueTitle !== undefined) {
    const labels = []
    if (issueBug === true) {
      labels.push('bug')
    }
    else {
      labels.push('enhancement')
    }

    // transform issueDeliverables into final form
    if (issueDeliverables !== undefined) {
      const deliverables = issueDeliverables.split(/(?:\n|;;)/)
      issueDeliverables = '- [ ] ' + deliverables.join('\n- [ ] ')
    }

    let issueBody = '';
    // sections
    [['Overview', issueOverview], ['Deliverables', issueDeliverables], ['Notes', issueNotes]]
      .forEach(([sectionName, sectionContent], i, array) => {
        if (sectionContent) {
          issueBody += `## ${sectionName}

${sectionContent}
`
          if (array[i + 1]?.[1] !== undefined) {
            issueBody += '\n'
          }
        }
      })

    const projectFQN = ghOrg + '/' + projectBasename

    const { number, html_url: htmlURL } =
      await createIssue({ authToken, projectFQN, title : issueTitle, body : issueBody, labels, reporter })
    issues.unshift(number + '')
    issueURL = htmlURL
  }// if issueTitle

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

  if (issueURL !== undefined && noOpenIssue !== true) {
    reporter.push(`Opening issue at: ${issueURL}`)
    tryExecAsync(`open ${issueURL}`, { noThrow : true })
  }

  if (submit === true) {
    reporter.push('Saving project from start...')
    // this will save all projects
    await doSave({
      // parameters
      noSend  : true,
      // for new issue v      v for existing issues
      summary : issueTitle || workData.description,
      projects,
      // system
      app,
      cache,
      reporter,
      req,
      res
    })

    // there is always only one project when submitting; this is checked at the start
    for (const project of projects) {
      const { projectPath } = await app.ext._liqProjects.playgroundMonitor.getProjectData(project)
      const workKey = determineCurrentBranch({ projectPath, reporter })

      reporter.push('Submitting project from start...')
      // pick up the answers
      res.set('X-Answer-Return-Command', `work ${workKey} submit`)
      await doSubmit({ app, cache, projects, reporter, req, res, workKey, ...req.vars })
    }
    return
  }

  httpSmartResponse({ data : workData, msg : reporter.taskReport.join('\n'), req, res })
}

const getStartEndpointParams = () => {
  const help = {
    name        : 'Work start',
    summary     : 'Creates a new unit of work.',
    description : 'Creates a new unit of work involving the designated projects. By default, the local development copy of any project which is a dependency of another is linked the dependent project unless `noLink` is specified.'
  }

  const method = 'post'
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
      name        : 'noOpenIssue',
      isBoolean   : true,
      description : "If true, supresses the default behavior of opening the newly created issue when 'issueTitle' and friends are set."
    },
    {
      name         : 'projects',
      isMultivalue : true,
      description  : 'The project(s) to include in the new unit of work. If none are specified, then will guess the current implied project based on the client working directory.',
      optionsFunc  : async({ app }) => await app.ext._liqProjects.playgroundMonitor.listProjects()
    },
    {
      name        : 'submit',
      isBoolean   : true,
      description : 'If true, immediately saves and submits the current work. Only compatible when the work is associated with a single project. This is useful for small changes already made. If the QA does not pass for any reason, it will halt the process after saving but before submission.'
    },
    ...commonAddProjectParameters(),
    ...commonAssignParameters()
  ]
  Object.freeze(parameters)

  return { help, method, parameters }
}

export { doStart, getStartEndpointParams }
