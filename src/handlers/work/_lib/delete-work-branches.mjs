import { determineCurrentBranch, determineOriginAndMain } from '@liquid-labs/git-toolkit'
import { tryExec } from '@liquid-labs/shell-toolkit'

const deleteWorkBranches = ({ app, noFetch, statusReport, workKey, reporter }) => {
  for (const [projectFQN, projectStatus] of Object.entries(statusReport.projects)) {
    reporter.push(`Considering deleting work branch in project ${projectFQN}...`)
    if (projectStatus.workBranch?.localBranchFound === true
        && projectStatus.localChanges?.mergedToRemoteMain === true) {
      const { projectPath } = app.ext._liqProjects.playgroundMonitor.getProjectData(projectFQN)
      const currBranch = determineCurrentBranch({ projectPath })
      if (currBranch === workKey) {
        const [, main] = determineOriginAndMain({ noFetch, projectPath, reporter })
        reporter.push(`Switching current branch from '${workKey}' to '${main}' before deleting '${workKey}'...`)
        tryExec(`cd '${projectPath}' && git checkout ${main}`,
          { msg : `Cannot switch from branch '${workKey}' to '${main}' in order to delete branch '${workKey}'. You may need to 'commit' or 'stash' your work.` })
      }
      tryExec(`cd '${projectPath}' && git branch -d ${workKey}`)
      projectStatus.workBranch.localBranchRemoved = true
    }
    else {
      reporter.push(`  skipping; local work branch ${projectStatus.workBranch?.localBranchFound !== true ? 'not found' : 'not merged'}.`)
    }
  }
}

export { deleteWorkBranches }
