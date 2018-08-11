# Offsite Archive Tool

A simple tool to help me archive my files to Amazon Glacier.

## Configuration

The controller expects a configuration file containing the following information:

    {
      workingDirectory: <String>,
      ssh: {
        user: <String>,
        idFile: <String>,
        host: <String>
      }
    }
