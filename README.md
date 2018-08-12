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

## Stages

The archiving procedure takes place in several steps.
One of the design goals of this tools is to make it possible to preserve the work of each step even if the subsequent step fails.
With each steps, it is indicated where the process is running.
The options are:
  * host: the computer running the tool
  * storage: the computer where the data was originally stored (e.g. NAS)

### Initialization (host)

Creating an entry with a unique id and the path to be archived.

    {
      id: <String>,
      uri: <String>,
      stage: 'initialized'
    }

### Compression (storage)

Generating a password and creating the compressed archive file.

    {
      id: <String>,
      uri: <String>,
      stage: 'compressing',
      compression: {
        password: <String>,
        filename: <String>,
        logFilename: <String>,
        pid: <String>
      }
    }

### Hashing (storage)

Hashing the archive file on the storage computer before the transfer to the host computer.

    {
      id: <String>,
      uri: <String>,
      stage: 'hashing',
      compression: {
        password: <String>,
        filename: <String>,
        logFilename: <String>,
        pid: <String>
      },
      hashing: {
        filename: <String>,
        pid: <String>
      }
    }

### Transfer (host)

Transferring the compressed archive file from the storage computer to the host computer.

    {
      id: <String>,
      uri: <String>,
      stage: 'hashing',
      compression: {
        password: <String>,
        filename: <String>,
        logFilename: <String>,
        pid: <String>
      },
      hashing: {
        filename: <String>,
        pid: <String>
      },
      transfer: {
        pid: <String>
      }
    }

### Hash check (host)

Calculating the hash of the archive file on the host computer and comparing it to the hash on the storage computer.

### Upload (host)

Uploading the archive file to AMAZON.

### Prepare information (host)

Create a compressed and encrypted file with the AMAZON archive id and the password.

### Store information (host)

Upload the AMAZON archive id and password to the web-space.
