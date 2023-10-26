/* global describe expect test */
import * as fsPath from 'node:path'

import { determineProjects } from '../determine-projects'

describe('determineProjects', () => {
  const projectPath = fsPath.join(__dirname, 'data', 'playground', 'orgA', 'proj1')
  const req = { get : (header) => header === 'X-CWD' ? projectPath : undefined }
  const mockWorkUnit = {
    projects : [{ name : '@orgA/proj1', private : true }]
  }
  const workDB = {
    requireData : (key) => key === 'orgA/proj1/1' ? mockWorkUnit : throw new Error(`Unexpected: ${key}`)
  }

  test.each([
    [false, 'orgA/proj1/1', undefined, ['@orgA/proj1']],
    [true, undefined, undefined, ['@orgA/proj1']],
    [false, undefined, ['@orgA/proj1'], ['@orgA/proj1']],
    [true, undefined, ['orgA/proj2'], ['@orgA/proj1']],
    [false, 'orgA/proj1/1', ['@orgA/proj1'], ['@orgA/proj1']]
  ])('(all: %p, workKey: %s, projects: %p) -> %p', async(all, workKey, projects, expectedResult) => {
    const [selectedProjects, workKeyOut, workUnit] =
      await determineProjects({ all, cliEndpoint : 'test', projects, req, workDB, workKey })

    expect(selectedProjects).toEqual(expectedResult)
    expect(workKeyOut).toBe('orgA/proj1/1')
    expect(workUnit).toEqual(mockWorkUnit)
  })

  test('throws with bad work key', () => {
    expect(() => determineProjects({ cliEndpoint : 'test', req, workDB, workKey : 'orgA/blah-blah-blah/1' }))
  })
})
