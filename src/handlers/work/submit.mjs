import * as fsPath from 'node:path'

import createError from 'http-errors'

import { determineOriginAndMain, verifyBranchInSync, verifyClean, workBranchName } from '@liquid-labs/git-toolkit'
import { determineGitHubLogin } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'
import { cleanupQAFiles, runQA, saveQAFiles } from '@liquid-labs/liq-qa-lib'
import { Octocache } from '@liquid-labs/octocache'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { GH_BASE_URL, WORKSPACE } from './_lib/constants'
import { WorkDB } from './_lib/work-db'

const help = {
  name        : 'Work submit.',
  summary     : 'Submits changes for review and merging.',
  description : `Submits the changes associated with a unit of work by creating a pull request for the changes in each project associated with the unit of work. By default, any un-pushed local changes are push to the proper remote. Each PR will reference the associated issues and linked to the primary project's PR for closing when it is merged.

Pushing chanes to the remote can be suppressed with \`noPush\`.

If you have portions that are complete, you can use the \`project\` parameter. Only the specified projects will be included in the submission. In that case, the first project specified will be considered the close target unless \`closeTarget\` is specified, though by default no issues are closed in a partial submit unless \`closes\` is specified.

By default, the system assigns the pull request to the submitter. This may be overriden with the \`assignees\` parameter. Where the system is configured to support it, reviewers are assigned programatically by referencing the reviewer 'qualifications'; alternatively, revewiers may be specified by \`reviewers\` parameter.

When no \`projects\`, no \`closes\` and \`noClose\` are __not__ specified, then the default is to designate the primary project as the \`closeTarget\` and note all issues as being closed when the close target pull request is merged. If the scope of the submission is limited by project or issue, then \`noClose\` is the default. In that situation, you can list specific issues closed via the \`closes\` parameter.

The close target is:
1. the project specified by \`closeTarget\`,
2. the first project listed explicitly by \`projects\`, or
3. the first project in the unit of work list of projects which is still active.`
}

const method = 'post'
const paths = [
  ['work', '.', 'submit'],
  ['work', ':workKey', 'submit']
]
const parameters = [
  {
    name         : 'assignees',
    isMultivalue : true,
    description  : 'The pull-request will be assigned to the indicated assignee(s) rather than to the submitter'
    // optionsFunc : pull from qualified staff (attach qualifications to roles)
  },
  {
    name         : 'closes',
    isMultivalue : true,
    description  : `When specified, the effective close target is noted to close the issues. The specified issues must already be associated with the unit of work. Refer to the method description and \`closeTarget\` for information on the effective close target. Issues are specified in the form of &gt;org&lt;/&lt;project&gt;/&lt;issue number&gt;.

    the primary project in the unit of work or, where specified, the first project listed explicitly will be noted to close the specified issues.`
  },
  {
    name        : 'closeTarget',
    description : 'The project which closes the issues associated with the submission. See method description and the`closes` parameter for more on the associated issues.'
  },
  {
    name        : 'dirtyOK',
    isBoolean   : true,
    description : 'When set, will continue even if the local repository is not clean.'
  },
  {
    name        : 'noBrowse',
    isBoolean   : true,
    description : 'Supresses default behavior of opening a browser to the newly created pull request.'
  },
  {
    name        : 'noClosed',
    isBoolean   : true,
    description : 'When set, then no issues are closed in a situation where they would otherwise be closed.'
  },
  {
    name        : 'noPush',
    isBoolean   : true,
    description : 'Supresses the default behavior of pushing local changes to the working remote. If the local and remote branch are not in sync and `noPush` is true, then an error will be thrown.'
  },
  {
    name         : 'projects',
    isMultivalue : true,
    description  : "Limits the project(s) whose changes are submitted to the specified projects. Projects are specified by a standard '&lt;org&gt;/&lt;project&gt;' ID."
    // optionsFunc  : from workDB; add a 'cache or read' function to WorkDB and use it for place like this.
  },
  {
    name         : 'qualifications',
    isMultivalue : true,
    description  : 'Limits the qualifications required to review the changes to the listed qualifications. Qualifications must be a subset of the project qualifications.'
  },
  {
    name         : 'reviewers',
    isMultivalue : true,
    description  : 'Specifies a '
  }
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  let { workKey } = req.vars
  if (workKey === undefined) { // then we're in a '.' call
    const clientCWD = req.get('X-CWD')
    if (clientCWD === undefined) { throw createError.NotFound('The \'.\' convention may not be used without providing a <code>X-CWD<rst> header.') }

    // eslint-disable-next-line prefer-regex-literals
    workKey = clientCWD.replace(new RegExp('(?:^|.*/)([^/]+/[^/]+)/?$'), '$1')
  }

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  const workDB = new WorkDB({ app, reporter }) // doesn't need auth token

  const workUnit = workDB.getData(workKey)
  if (workUnit === undefined) throw createError.NotFound(`No such active unit of work '${workKey}' found.`)

  const { dirtyOK, noPush = false } = req.vars
  let { assignees, closes, closeTarget, noBrowse = false, noCloses = false, projects } = req.vars

  // determine assignee(s)
  if (assignees === undefined) {
    assignees = [(await determineGitHubLogin({ authToken })).login]
  }

  // determine the projects to submit
  if (projects === undefined) {
    projects = workUnit.projects
  }
  else {
    // remove duplicates in the list
    projects = projects.filter((p, i, arr) => i === arr.indexOf(p))
    projects.forEach((p, i, arr) => {
      const project = workUnit.projects.find((wup) => wup.name === p)
      if (project === undefined) { throw createError.NotFound(`No record of project <em>${p}<rst> in unit of work '${workKey}'.`) }

      arr.splice(i, 1, project)
    })
  }
  // projects is now an array of project entries ({ name, private })

  // we can now check if we are closing issues and which issues to close
  // because we de-duped, the lists would have equiv length our working set named all
  if (projects.length !== workUnit.projects.length && noCloses !== false && closes === undefined) {
    noCloses = true
  }
  else if (noCloses !== true) {
    closes = closes || workUnit.issues.map((i) => i.id)
    closeTarget = closeTarget || projects[0].name
  }

  // inputs have ben normalized we are now ready to start verifying the repo state
  const workBranch = workBranchName({ primaryIssueID : workUnit.issues[0].id })

  const setRemote = ({ isPrivate, projectPath }) => {
    let remote
    if (isPrivate === true) { ([remote] = determineOriginAndMain({ projectPath, reporter })) }
    else { remote = WORKSPACE }

    return remote
  }

  // first, we check readiness
  for (const { name: projectFQN, private: isPrivate } of projects) {
    reporter.push(`Checking status of <em>${projectFQN}<rst>...`)
    const [org, project] = projectFQN.split('/')
    const projectPath = fsPath.join(app.liq.playground(), org, project)

    const remote = setRemote({ isPrivate, projectPath })

    if (dirtyOK !== true) {
      verifyClean({ projectPath, reporter })
    }
    if (noPush !== true) {
      tryExec(`cd '${projectPath}' && git push ${remote} ${workBranch}`)
    }
    verifyBranchInSync({ branch : workKey, description : 'work', projectPath, remote, reporter })
  }
  // we are ready to generate QA files and submit work

  const prURLs = []
  const prCalls = []
  for (const { name: projectFQN, private: isPrivate } of projects) {
    const [org, project] = projectFQN.split('/')
    const projectPath = fsPath.join(app.liq.playground(), org, project)

    runQA({ projectPath, reporter })
    saveQAFiles({ projectPath, reporter })
    cleanupQAFiles({ projectPath, reporter })
    // now we need to push the updates to the remote
    const remote = setRemote({ isPrivate, projectPath })
    tryExec(`cd '${projectPath}' && git push ${remote} ${workBranch}`)

    const octocache = new Octocache({ authToken })

    let head
    if (isPrivate === true) {
      head = workBranch
    }
    else {
      const ghUser = await determineGitHubLogin({ authToken })
      head = `${ghUser.login}:${workBranch}`
    }

    const openPRs = await octocache.paginate(`GET /repos/${org}/${project}/pulls`, { head, state : 'open' })
    if (openPRs.length > 0) { // really, should (and I think can) only be one, but this is the better question anyway
      reporter.push(`Project <em>${projectFQN}<rst> branch <code>${workBranch}<rst> PR <bold>extant and open<rst>; pushing updates...`)
      let remote
      if (isPrivate === true) { ([remote] = determineOriginAndMain({ projectPath, reporter })) }
      else { remote = WORKSPACE }
      tryExec(`cd '${projectPath}' && git push ${remote} ${workBranch}`)

      for (const pr of openPRs) {
        prURLs.push(`${GH_BASE_URL}/${org}/${project}/pulls/${pr.number}`)
      }
    }
    else { // we create the PR
      reporter.push(`Creating PR for <em>${projectFQN}<rst> branch <code>${workBranch}<rst>...`)
      // build up the PR body
      let body = 'Pull request '

      body += projectFQN === closeTarget ? 'to' : 'in support of issues'
      body += closes.length > 1 ? ': \n* ' : ' '
      body += closes
        .map((i) => {
          const [o, p, n] = i.split('/')
          const issueRef = `${o}/${p}` === project ? `#${n}` : `${o}/${p}#${n}`
          return projectFQN === closeTarget
            ? `resolve ${issueRef}`
            : `[${issueRef}](${GH_BASE_URL}/${o}/${p}/issues/${n})`
        })
        .join('\n* ')
      if (projects.length > 1) {
        const otherProjects = projects.filter((p) => p.name !== projectFQN)
        body += '\n\nRelated projects: '
        body += otherProjects.map(({ name: otherProjFQN }) =>
          `[${otherProjFQN}](${GH_BASE_URL}/${otherProjFQN}) `
              + `([PRs](${GH_BASE_URL}/${otherProjFQN}/pulls?q=head%3A${encodeURIComponent(workBranch)}))`
        )
          .join(', ')
      }

      const repoData = await octocache.request(`GET /repos/${org}/${project}`)
      const base = repoData.default_branch

      prCalls.push(doPR({ base, body, head, octocache, org, project, prURLs, workUnit }))
    }
  }

  if (prCalls.length > 0) {
    await Promise.all(prCalls)
  }

  if (noBrowse !== true) {
    for (const url of prURLs) {
      tryExec(`open ${url}`, { noThrow : true })
    }
  }

  httpSmartResponse({
    msg : reporter.taskReport.join('\n'),
    req,
    res
  })
}

const doPR = async({ base, body, head, octocache, org, project, prURLs, workUnit }) => {
  const pr = await octocache.request(
    'POST /repos/{owner}/{repo}/pulls',
    {
      owner : org,
      repo  : project,
      title : workUnit.description,
      body,
      head,
      base
    })

  prURLs.push(`${GH_BASE_URL}/${org}/${project}/pulls/${pr.number}`)
}

export { func, help, parameters, paths, method }
