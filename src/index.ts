#!/usr/bin/env bun
import { createProgram } from './cli/program.js'

const program = createProgram()
program.parse()
