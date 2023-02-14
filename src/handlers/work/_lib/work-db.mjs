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

    /**
     * #### Parameters
     * - `issues`: an array of strings in the  form of &lt;org&gt;/&lt;project base name&gt;-&lt;issue number&gt;
     * - `projects`: an array of fully qaulified project names
     * - `workBranch`: the name of the work branch.
     */
    this.startWork = async({ description, issues, projects, workBranch }) => {
      const now = new Date()
      const initiator = determineAuthorEmail()
      if (description === undefined) {
        this.#reporter?.push(`Trying to determine work description from issue '${issues[0]}' title...`)

        const octokit = new Octocache({ authToken : this.#authToken })
        const [owner, repo, issue_number] = issues[0].split('/') // eslint-disable-line camelcase

        const issue = await octokit.request(`GET /repos/${owner}/${repo}/issues/${issue_number}`)
        description = issue.title
        this.#reporter?.push(`  got: ${description}`)
      }

      this.#data[workBranch] = {
        description,
        initiator,
        issues   : [...issues],
        projects : [...projects],
        started  : now.getUTCFullYear() + '-'
          + (now.getUTCMonth() + '').padStart(2, '0') + '-'
          + (now.getUTCDay() + '').padStart(2, '0'),
        startedEpoch : now.getTime(),
        workBranch
      }

      this.save()
      return structuredClone(this.#data[workBranch])
    } // end 'startWork'
  }

  save() {
    writeFJSON({ data : this.#data, file : this.#dbFilePath })
  }
}

export { WorkDB }
