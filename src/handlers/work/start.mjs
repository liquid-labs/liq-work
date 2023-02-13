import * as fsPath from 'node:path'

import { hasRemote } from '@liquid-labs/git-toolkit'
import { claimIssues, determineGitHubLogin, verifyIssuesAvailable, workBranchName } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purpose } from '@liquid-labs/liq-credentials-db'
import { tryExec } from '@liquid-labs/shell-toolkit'

const help = {
  name        : 'Work start',
  summary     : 'Creates a new unit of work.',
  description : `Creates a new unit of work involving the designated projects.`
}

const method = 'post'
const path = ['work', 'start']
const parameters = [
  {
    name : 'issues',
    required: true,
    isMultivalue: true,
    description: 'References to the issues associated to the work. May be an integer number when assoicated with the first project specified or have the form &lt;org&gt/&lt;project name&gt;-&lt;issue number&gt;.'
  },
  {
    name         : 'projects',
    required     : true,
    isMultivalue : true,
    description  : 'The project(s) to include in the new unit of work.'
  },
  {
    name: 'assignee',
    description: 'The assignee (github login ID) to add to the issues. See `noAutoAssign`.'
  },
  {
    name: 'comemnt',
    description: "The comment to use when claiming an issue. Defaults to: 'Work for this issue has begun on branch &lt;workBranchName&gt;.'"
  },
  {
    name: 'noAutoAssign',
    isBoolean: true,
    description: "Suppresses the default behavior of assigning the issue based on the current user's GitHub authentication."
  }
]
Object.freeze(parameters)

const WORKSPACE='workspace'

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  let { assignee, comment, issues, noAutoAssign = false, projects } = req.vars

  // normalize issues as '<org>/<project>/<issue number>'
  issues = issues.map((i) => i.match(/^\d+$/) ? projects[0] + '-' + i : i)

  for (const project of projects) {
    if (!(project in model.playground.projects))
      throw createError.BadRequest(`No such local project '${project}'. Do you need to import it?`)
  }

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.token(purpose.GITHUB_API)

  verifyIssuesAvailable({ authToken, issues, noAutoAssign, notClosed: true })
  claimIssues({ assignee, authToken, comment, issues })

  const workBranch = workBranchName({ primaryIssueID: issues[0] })
  const octokit = new Octokit({ auth: authToken })
  for (const project of projects) {
    const [ org, projectBaseName ] = project.split('/')
    const projectPath = fsPath.join(app.liqPlayground(), org, projectBaseName)

    const repoData = await octokit.request('GET /repos/{owner}/{repo}', {
      owner: org,
      repo: projectBaseName
    })
    const isPrivate = repoData.private

    if (isPrivate) { // TODO: allow option to use the private protocol with public repos where user has write perms
      await setupPrivateWork({ octokit, org, projectBaseName, projectPath, workBranch })
    }
    else { // it's a public repo
      await setupPublicWork({ authToken, octokit, org, projectBaseName, workBranch })
    }
  }

  const workDB = new WorkDB({ app, authToken })
  const workData = await workDB.startWork({ issues, projects, workBranch })

  httpSmartResponse({ data: workData, message: `Started work '${workData.describe}'.`})
}

const setupPrivateWork = async ({ octokit, org, projectBaseName, projectPath, workBranch }) => {
  await checkoutWorkBranch({ octokit, owner: org, projectBaseName, projectPath, workBranch })
}

const setupPublicWork = async ({ authToken, octokit, org, projectBaseName, workBranch }) => {
  const ghUser = determineGitHubLogin({ authToken })
  const workRepoData = await octokit.request('GET /repos/{owner}/{repo}', {
    owner: ghUser,
    repo: projectBaseName
  })
  console.log('workRepoData:', workRepoData) // DEBUG

  if (!workRepoData) { // then we need to create a fork
    await octokit.request('POST /repos/{owner}/{repo}/forks', {
      owner: org,
      repo: projectBaseName,
      organization: 'octocat',
      default_branch_only: true
    })
  }

  // now, let's see if the remote has been set up
  if (!hasRemote({ projectPath, remote: WORKSPACE, urlMatch: `/${projectBaseName}(?:[.]git)?(?:\\s|$)` })) {
    if (hasRemote({ projectPath, remote: WORKSPACE })) {
      throw createError.BadRequest(`Project ${org}/${projectBaseName} has a work remote with an unexpected URL. Check and address.`)
    }
    // else, really doesn't have a remote; let's create one
    tryExec(`cd '${projectPath}' && git remote add ${WORKSPACE} git@github.com:${ghUser}/${projectBaseName}.git`)
  }

  await checkoutWorkBranch({ octokit, owner: ghUser, projectBaseName, projectPath, remote: WORKSPACE, workBranch })
}

const checkoutWorkBranch = async ({ octokit, owner, projectBaseName, projectPath, remote, workBranch }) => {
  const branchData = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
    owner,
    repo: projectBaseName,
    branch: workBranch
  })
  console.log('branchData:', branchData) // DEBUG
  const hasRemoteBranch = !!branchData
  const hasLocalBranch = hasBranch({ branch: workBranch, projectPath })
  remote = remote || determineOriginAndMain({ projectPath, reporter })[0]

  const refSpec = `${remote} ${workBrach}`
  if (hasRemoteBranch === false && hasLocalBranch === false) {
    reporter.push(`Creating and pusing '${workBranch}...`)
    tryExec(`cd '${projectPath}' && git checkout -b ${workBranch} && git push --set-upstream ${refSpec}`)
  }
  else if (hasRemoteBranch === true) {
    reporter.push(`Pulling remote branch ${workBranch}...`)
    tryExec(`cd '${projectPath}' && git pull --set-upstream ${refSpec}`)
  }
  else if (hasLocalBranch === true) {
    reporter.push(`Pushing local branch ${workBranach}...`)
    tryExec(`cd '${projectPath}' && git push --set-upstream ${refSpec}`)
  }
  else {
    reporter.push(`Work branch '${workBranch}' exists locally and remotely; nothing to do.`)
  }
}

export { func, help, parameters, path, method }
