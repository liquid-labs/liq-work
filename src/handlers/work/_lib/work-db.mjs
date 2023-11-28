import createError from 'http-errors'

import { readFJSON, writeFJSON } from '@liquid-labs/federated-json'
import {
  determineAuthorEmail,
  determineOriginAndMain,
  hasBranch,
  hasRemote,
  workBranchName,
  verifyIsOnBranch
} from '@liquid-labs/git-toolkit'
import { determineGitHubLogin, getGitHubOrgAndProjectBasename } from '@liquid-labs/github-toolkit'
import { crossLinkDevProjects } from '@liquid-labs/liq-projects-lib'
import { Octocache } from '@liquid-labs/octocache'
import { PLUGABLE_PLAYGROUND } from '@liquid-labs/plugable-defaults'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WORKSPACE } from './constants'

const WorkDB = class WorkDB {
  #authToken
  #data
  #dbFilePath
  #playgroundPath
  #reporter

  constructor({ app, authToken, reporter }) {
    this.#dbFilePath = app.ext.constants.WORK_DB_PATH
    this.#playgroundPath = PLUGABLE_PLAYGROUND()
    this.#authToken = authToken // TODO: for security, do wo want to take this on a call by call basis to reduce the numbers of copies? Or do they all point to the same stirng? I think that may bet the case but I don't remember for sure.
    this.#data = readFJSON(this.#dbFilePath, { createOnNone : {} })
    this.#reporter = reporter
  }

  async addIssues({ issues, noSave = false, workKey }) {
    const workData = this.#data[workKey] // don't use 'getData', we want the original.
    const currIssues = workData.issues.map((i) => i.id)

    issues = issues.map((i) => i.match(/^\s*\d+\s*$/) ? `${workKey}/${i.trim()}` : i.trim())
    issues = issues.filter((issue, i, arr) => i === arr.indexOf(issue) && !currIssues.includes(issue)) // remove dupes

    const octocache = new Octocache({ authToken : this.#authToken })
    for (const issue of issues) {
      const [org, project, number] = issue.split('/')
      const issueData = await octocache.request(`GET /repos/${org}/${project}/issues/${number}`)
      workData.issues.push({
        id      : issue,
        summary : issueData.title
      })
    }

    if (noSave !== true) {
      this.save()
    }

    return structuredClone(workData)
  }

  async addProjects({ app, projects, reporter, noLink = false, noSave = false, workKey }) {
    const workData = this.#data[workKey] // don't use 'getData', we want the original.
    if (workData === undefined) { throw createError.NotFound(`No such unit of work '${workKey}'.`) }

    const currProjects = workData.projects.map((p) => p.name)

    projects = projects.filter((p, i, arr) => i === arr.indexOf(p) && !currProjects.includes(p)) // remove dupes

    if (projects.length > 0) {
      await this.#setupWorkBranches({ app, projects, reporter, workBranch : workKey })

      const octocache = new Octocache({ authToken : this.#authToken })
      for (const project of projects) {
        const { packageJSON } = await app.ext._liqProjects.playgroundMonitor.getProjectData(project)
        const { org: ghOrg, projectBasename } = getGitHubOrgAndProjectBasename({ packageJSON })
        const projectData = await octocache.request(`GET /repos/${ghOrg}/${projectBasename}`)
        workData.projects.push({
          name    : project,
          private : projectData.private
        })
      }

      if (noSave !== true) {
        this.save()
      }
    }

    if (noLink !== true) {
      // that's all projects across all units of work
      const allProjects = Object.keys(Object.values(this.#data)
        .reduce((acc, wd) => { wd.projects.forEach(({ name }) => { acc[name] = true }); return acc }, {}))
      await crossLinkDevProjects({ app, projects : allProjects, reporter })
    }

    return structuredClone(workData)
  }

  closeWork(workKey) {
    delete this.#data[workKey]
    this.save()
  }

  getData(workKey) {
    return structuredClone(this.#data[workKey])
  }

  getIssueKeys(workKey) { return this.#data[workKey].issues.map((i) => i.id) }

  getWorkKeys() { return Object.keys(this.#data).filter((k) => !k.startsWith('_')) }

  removeIssues({ issues, workKey }) {
    const workData = this.#data[workKey]
    if (workData) {
      workData.issues = workData.issues.filter((i) => !issues.includes(i.id))
      this.save()
    }
    else throw createError.NotFound(`No such unit of work '${workKey}' found active work DB.`)

    return structuredClone(workData)
  }

  removeProjects({ projects, workKey }) {
    const workData = this.#data[workKey]
    if (workData) {
      workData.projects = workData.projects.filter((i) => !projects.includes(i.name))
      this.save()
    }
    else throw createError.NotFound(`No such unit of work '${workKey}' found active work DB.`)

    return structuredClone(workData)
  }

  requireData(workKey) {
    const workUnit = this.getData(workKey)
    if (workUnit === undefined) {
      throw createError.NotFound(`No such unit of work '${workKey}'.`)
    }

    return workUnit
  }

  async #setupWorkBranches({ app, projects, reporter, workBranch }) {
    const octocache = new Octocache({ authToken : this.#authToken })
    for (const project of projects) {
      reporter.push(`Processing work branch for <em>${project}<rst>...`)

      const { packageJSON, projectPath } = await app.ext._liqProjects.playgroundMonitor.getProjectData(project)
      const { org: ghOrg, projectBasename } = getGitHubOrgAndProjectBasename({ packageJSON })

      let repoData
      const ghProject = ghOrg + '/' + projectBasename
      try {
        repoData = await octocache.request(`GET /repos/${ghProject}`)
      }
      catch (e) {
        if (e.status === 404) throw createError.NotFound(`Could not find project '${project}' repo '${ghProject} on GitHub: ${e.message}`, { cause : e })
      }
      const isPrivate = repoData.private
      const defaultBranch = repoData.default_branch
      verifyIsOnBranch({ branches : [defaultBranch, workBranch], projectPath, reporter })

      if (isPrivate) { // TODO: allow option to use the private protocol with public repos where user has write perms
        await setupPrivateWork({ octocache, projectFQN : project, projectPath, reporter, workBranch })
      }
      else { // it's a public repo
        await setupPublicWork({
          authToken  : this.#authToken,
          ghOrg,
          octocache,
          projectBasename,
          projectFQN : project,
          projectPath,
          reporter,
          workBranch
        })
      }
    }
  }

  /**
   * #### Parameters
   * - `description`: an optional description. Leaving descirption `undefined` will result in the generation of ta
   *    default description.
   * - `issues`: an array of strings in the  form of &lt;org&gt;/&lt;project base name&gt;-&lt;issue number&gt;
   * - `projects`: an array of fully qaulified project names
   * - `workBranch`: the name of the work branch.
   */
  async startWork({ app, description, issues, projects, reporter }) {
    const octocache = new Octocache({ authToken : this.#authToken })
    const now = new Date()

    // Gather basic info
    const workBranch = workBranchName({ primaryIssueID : issues[0] })

    const initiator = determineAuthorEmail()
    if (description === undefined) {
      this.#reporter?.push(`Trying to determine work description from issue '${issues[0]}' title...`)

      const [owner, repo, issue_number] = issues[0].split('/') // eslint-disable-line camelcase

      // eslint-disable-next-line camelcase
      const issue = await octocache.request(`GET /repos/${owner}/${repo}/issues/${issue_number}`)
      description = issue.title
      this.#reporter?.push(`  got: ${description}`)
    }

    // set up issues data
    const issuesData = []
    for (const issue of issues) {
      const [org, projectBasename, number] = issue.split('/')
      const issueData = await octocache.request(`GET /repos/${org}/${projectBasename}/issues/${number}`)
      issuesData.push({
        id      : issue,
        summary : issueData.title
      })
    }

    this.#data[workBranch] = {
      description,
      initiator,
      issues   : [], // 'issues' data will be added next
      projects : [], // 'projects' will be added after that
      started  : now.getUTCFullYear() + '-'
        + ((now.getUTCMonth() + 1) + '').padStart(2, '0') + '-'
        + (now.getUTCDate() + '').padStart(2, '0'),
      startedEpoch : now.getTime(),
      workBranch
    }

    await this.addIssues({ issues, noSave : true, reporter, workKey : workBranch })
    await this.addProjects({ app, projects, reporter, workKey : workBranch }) // this will save

    return structuredClone(this.#data[workBranch])
  } // end 'startWork'

  save() {
    writeFJSON({ data : this.#data, file : this.#dbFilePath })
  }
}

const setupPrivateWork = async({ octocache, projectFQN, projectPath, reporter, workBranch }) => {
  reporter.push(`Setting up <bold>private<rst> work branch <em>${workBranch}<rst>...`)
  await checkoutWorkBranch({ octocache, projectFQN, projectPath, reporter, workBranch })
}

const setupPublicWork = async({
  authToken,
  ghOrg,
  octocache,
  projectBasename,
  projectFQN,
  projectPath,
  reporter,
  workBranch
}) => {
  reporter.push(`Setting up <bold>public<rst> work branch <em>${workBranch}<rst>...`)
  const ghUser = (await determineGitHubLogin({ authToken })).login
  let workRepoData
  try {
    workRepoData = await octocache.request(`GET /repos/${ghUser}/${projectBasename}`)
  }
  catch (e) {
    if (e.status !== 404) throw e
    // else, just procede, we were testing if it exists and it doesn't so no problem.
  }

  if (!workRepoData) { // then we need to create a fork
    reporter.push(`Creating fork <em>${ghUser}/${projectBasename}<rst> (from <bold>${ghOrg}/${projectBasename}<rst>)`)
    await octocache.request('POST /repos/{owner}/{repo}/forks', {
      owner               : ghOrg,
      repo                : projectBasename,
      default_branch_only : true
    })
  }

  // now, let's see if the remote has been set up
  if (!hasRemote({ projectPath, remote : WORKSPACE, urlMatch : `/${projectBasename}(?:[.]git)?(?:\\s|$)` })) {
    if (hasRemote({ projectPath, remote : WORKSPACE })) {
      throw createError.BadRequest(`Project ${projectFQN} has a work remote with an unexpected URL. Check and address.`)
    }
    // else, really doesn't have a remote; let's create one
    reporter.push(`Creating local remote '${WORKSPACE}' for '${ghUser}/${projectBasename}`)
    tryExec(`cd '${projectPath}' && git remote add ${WORKSPACE} git@github.com:${ghUser}/${projectBasename}.git`)
  }

  await checkoutWorkBranch({ octocache, owner : ghUser, projectBasename, projectPath, remote : WORKSPACE, reporter, workBranch })
}

/**
 * Internal function to checkout the local work branch and set it to the proper upstream. Expects `remote` to exist.
 */
const checkoutWorkBranch = async({
  octocache,
  owner, // owner + projectBasename or projectFQN
  projectBasename,
  projectFQN,
  projectPath,
  remote,
  reporter,
  workBranch
}) => {
  const remoteBranchProject = projectFQN || `${owner}/${projectBasename}`

  let hasRemoteBranch
  try {
    await octocache.request(`GET /repos/${remoteBranchProject}/branches/${workBranch}`)
    hasRemoteBranch = true
  }
  catch (e) {
    if (e.status === 404) hasRemoteBranch = false
    else throw e
  }
  const hasLocalBranch = hasBranch({ branch : workBranch, projectPath })
  remote = remote || determineOriginAndMain({ projectPath, reporter })[0]
  reporter.push(`Has remote branch: ${hasRemoteBranch}, has local branch: ${hasLocalBranch}; remote is ${remote}`)

  const refSpec = `${remote} ${workBranch}`
  if (hasRemoteBranch === false && hasLocalBranch === false) {
    reporter.push(`Creating and pusing '${workBranch}'...`)
    tryExec(`cd '${projectPath}' && git checkout -b ${workBranch} && git push --set-upstream ${refSpec}`)
  }
  else if (hasRemoteBranch === true && hasLocalBranch === false) {
    reporter.push(`Pulling '${workBranch}' from remote...`)
    tryExec(`cd '${projectPath}' && git pull --set-upstream ${refSpec}`)
  }
  else if (hasRemoteBranch === false && hasLocalBranch === true) {
    reporter.push(`Pushing '${workBranch}' to remote...`)
    tryExec(`cd '${projectPath}' && git push --set-upstream ${refSpec}`)
  }
  else {
    reporter.push(`Work branch '${workBranch}' exists locally and remotely; nothing to do.`)
  }
}

export { WorkDB }
