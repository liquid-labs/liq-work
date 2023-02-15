import structuredClone from 'core-js-pure/actual/structured-clone'

import { readFJSON, writeFJSON } from '@liquid-labs/federated-json'
import { determineAuthorEmail } from '@liquid-labs/git-toolkit'
import { Octocache } from '@liquid-labs/octocache'

const WorkDB = class WorkDB {
  #authToken
  #data
  #dbFilePath
  #reporter

  constructor({ app, authToken, reporter }) {
    this.#dbFilePath = app.liq.constants.WORK_DB_PATH
    this.#authToken = authToken // TODO: for security, do wo want to take this on a call by call basis to reduce the numbers of copies? Or do they all point to the same stirng? I think that may bet the case but I don't remember for sure.
    this.#data = readFJSON(this.#dbFilePath, { createOnNone : {} })
    this.#reporter = reporter
  }

  async addIssues({ authToken, issues, workKey }) {
    const workData = this.#data[workKey] // don't use 'getData', we want the original.

    const octocache = new Octocache({ authToken })
    for (const issue of issues) {
      const [ org, project, number ] = issue.split('/')
      const issueData = await octocache.request(`GET /repos/${org}/${project}/issues/${number}`)
      workData.issues.push({
        id: issue,
        summary: issueData.title
      })
    }

    this.save()

    return structuredClone(workData)
  }

  getData(workKey) {
    return structuredClone(this.#data[workKey])
  }

  getIssueKeys(workKey) { return this.#data[workKey].issues.map((i) => i.id )}

  getWorkKeys() { return Object.keys(this.#data) }

  removeIssues({ issues, workKey }) {
    const workData = this.#data[workKey]
    if (workData) {
      workData.issues = workData.issues.filter((i) => !issues.includes(i.id))
    }

    this.save()

    return structuredClone(workData)
  }

  /**
   * #### Parameters
   * - `issues`: an array of strings in the  form of &lt;org&gt;/&lt;project base name&gt;-&lt;issue number&gt;
   * - `projects`: an array of fully qaulified project names
   * - `workBranch`: the name of the work branch.
   */
  async startWork ({ description, issues, projects, workBranch }) {
    const octokit = new Octocache({ authToken : this.#authToken })
    const now = new Date()
    const initiator = determineAuthorEmail()
    if (description === undefined) {
      this.#reporter?.push(`Trying to determine work description from issue '${issues[0]}' title...`)

      const [owner, repo, issue_number] = issues[0].split('/') // eslint-disable-line camelcase

      const issue = await octokit.request(`GET /repos/${owner}/${repo}/issues/${issue_number}`)
      description = issue.title
      this.#reporter?.push(`  got: ${description}`)
    }

    const issuesData = []
    for (const issue of issues) {
      const [ org, projectBaseName, number ] = issue.split('/')
      const issueData = await octokit.request(`GET /repos/${org}/${projectBaseName}/issues/${number}`)
      issuesData.push({
        id: issue,
        summary: issueData.title
      })
    }

    const projectsData = []
    for (const project of projects) {
      const projectData = await octokit.request(`GET /repos/${project}`)
      projectsData.push({
        name: project,
        private: projectData.private
      })
    }

    this.#data[workBranch] = {
      description,
      initiator,
      issues   : issuesData,
      projects : projectsData,
      started  : now.getUTCFullYear() + '-'
        + (now.getUTCMonth() + '').padStart(2, '0') + '-'
        + (now.getUTCDay() + '').padStart(2, '0'),
      startedEpoch : now.getTime(),
      workBranch
    }

    this.save()
    return structuredClone(this.#data[workBranch])
  } // end 'startWork'

  save() {
    writeFJSON({ data : this.#data, file : this.#dbFilePath })
  }
}

export { WorkDB }
