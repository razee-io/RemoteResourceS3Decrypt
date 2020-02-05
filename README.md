# RemoteResourceS3Decrypt

[![Build Status](https://travis-ci.com/razee-io/RemoteResourceS3Decrypt.svg?branch=master)](https://travis-ci.com/razee-io/RemoteResourceS3Decrypt)
[![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=razee-io/RemoteResourceS3Decrypt)](https://dependabot.com)
![GitHub](https://img.shields.io/github/license/razee-io/RemoteResourceS3Decrypt.svg?color=success)

RemoteResourceS3Decrypt is a variant of RemoteResourceS3. RemoteResourceS3Decrypt
extends the S3 functionality by supporting decryption and tar extraction of downloaded
resources.

## Install

```shell
kubectl apply -f "https://github.com/razee-io/RemoteResourceS3Decrypt/releases/latest/download/resource.yaml"
```

## Resource Definition

### Sample

```yaml
apiVersion: "deploy.razee.io/v1alpha2"
kind: RemoteResourceS3Decrypt
metadata:
  name: <remote_resource_s3_name>
  namespace: <namespace>
spec:
  gpg:
    privateKeys:
      - |
        -----BEGIN PGP PRIVATE KEY BLOCK-----

        your asci armored gpg key would go here
        -----END PGP PRIVATE KEY BLOCK-----
    privateKeyRefs:
      - valueFrom:
          secretKeyRef:
            name: <name of secret resource>
            namespace: <namespace of secret resource - optional>
            key: <key of gpg_key within secret>
  auth:
    # hmac:
    #   access_key_id: <key id>
    #   secret_access_key: <access key>
    iam:
      response_type: <provider response type>
      grant_type: <provider grant type>
      url: <iam auth provider>
      api_key:
        valueFrom:
          secretKeyRef:
            name: <name of secret resource>
            namespace: <namespace of secret resource - optional>
            key: <key of api_key within secret>
  requests:
    - options:
        url: https://<source_repo_url>/<file_name1>
        headers:
          <header_key1>: <header_value1>
          <header_key2>: <header_value2>
    - optional: true
      options:
        url: http://<source_repo_url>/<file_name2>
    - options:
        url: http://<source_repo_url>/<bucket_path>/
```

### Spec

**Path:** `.spec`

**Description:** `spec` is required and **must** include section `requests`.
You may also include `auth`, to make connecting to S3 easier.

**Schema:**

```yaml
spec:
  type: object
  required: [requests]
  properties:
    gpg:
      type: object
      ...
    auth:
      type: object
      ...
    requests:
      type: array
      ...
```

### GPG

**Path:** `.spec.gpg`

**Description:** An array of gpg keys to be imported, for decrypting files.

**Schema:**

```yaml
gpg:
  type: object
  oneOf:
    - required: [privateKeys]
    - required: [privateKeyRefs]
  properties:
    privateKeys:
      type: array
      items:
        type: string
    privateKeyRefs:
      type: array
      items:
        type: object
        required: [valueFrom]
        properties:
          valueFrom:
            type: object
            required: [secretKeyRef]
            properties:
              secretKeyRef:
                type: object
                required: [name, key]
                properties:
                  name:
                    type: string
                  namespace:
                    type: string
                  key:
                    type: string
```

### Auth: HMAC

**Path:** `.spec.auth.hmac`

**Description:** Allows you to connect to s3 buckets using an HMAC key/id pair.

**Schema:**

```yaml
hmac:
  type: object
  allOf:
    - oneOf:
        - required: [accessKeyId]
        - required: [accessKeyIdRef]
    - oneOf:
        - required: [secretAccessKey]
        - required: [secretAccessKeyRef]
  properties:
    accessKeyId:
      type: string
    accessKeyIdRef:
      type: object
      required: [valueFrom]
      properties:
        valueFrom:
          type: object
          required: [secretKeyRef]
          properties:
            secretKeyRef:
              type: object
              required: [name, key]
              properties:
                name:
                  type: string
                namespace:
                  type: string
                key:
                  type: string
    secretAccessKey:
      type: string
    secretAccessKeyRef:
      type: object
      required: [valueFrom]
      properties:
        valueFrom:
          type: object
          required: [secretKeyRef]
          properties:
            secretKeyRef:
              type: object
              required: [name, key]
              properties:
                name:
                  type: string
                namespace:
                  type: string
                key:
                  type: string
```

### Auth: IAM

**Path:** `.spec.auth.iam`

**Description:** Allows you to connect to s3 buckets using an IAM provider and
api key.

**Schema:**

```yaml
iam:
  type: object
  allOf:
    - required: [responseType, grantType, url]
    - oneOf:
        - required: [apiKey]
        - required: [apiKeyRef]
  properties:
    responseType:
      type: string
    grantType:
      type: string
    url:
      type: string
      format: uri
    apiKey:
      type: string
    apiKeyRef:
      type: object
      required: [valueFrom]
      properties:
        valueFrom:
          type: object
          required: [secretKeyRef]
          properties:
            secretKeyRef:
              type: object
              required: [name, key]
              properties:
                name:
                  type: string
                namespace:
                  type: string
                key:
                  type: string
```

**Note:**

- Sample values for [IBM Cloud Object Storage](https://cloud.ibm.com/docs/services/cloud-object-storage/cli?topic=cloud-object-storage-curl)
  - response_type: "cloud_iam"
  - grant_type: "urn:ibm:params:oauth:grant-type:apikey"
  - url: "[https://iam.cloud.ibm.com/identity/token](https://iam.cloud.ibm.com/identity/token)"

### Request Options

**Path:** `.spec.requests[].options`

**Description:** All options defined in an options object will be passed as-is
to the http request. This means you can specify things like headers for
authentication in this section.

**Schema:**

```yaml
options:
  type: object
  oneOf:
    - required: [url]
    - required: [uri]
  properties:
    url:
      type: string
      format: uri
    uri:
      type: string
      format: uri
```

### Optional Request

**Path:** `.spec.requests[].optional`

**Description:** if download or applying child resource fails, RemoteResource
will stop execution and report error to `.status`. You can allow execution to
continue by marking a reference as optional.

**Schema:**

```yaml
optional:
  type: boolean
```

**Default:** `false`

### Download Directory Contents

- If url/uri ends with `/`, we will assume this is an S3 directory and will attempt
to download all resources in the directory.
- Every resource within the directory will be downloaded using the `.spec.requests[].options`
provided with the directory url.
- Path must follow one of:
  - `http://s3.endpoint.com/bucket/path/to/your/resources/`
  - `http://bucket.s3.endpoint.com/path/to/your/resources/`

### Managed Resource Labels

#### Reconcile

Child resource: `.metadata.labels[deploy.razee.io/Reconcile]`

- DEFAULT: `true`
  - A razeedeploy resource (parent) will clean up a resources it applies (child)
when either the child is no longer in the parent resource definition or the
parent is deleted.
- `false`
  - This behavior can be overridden when a child's resource definition has
the label `deploy.razee.io/Reconcile=false`.

#### Resource Update Mode

Child resource: `.metadata.labels[deploy.razee.io/mode]`

Razeedeploy resources default to merge patching children. This behavior can be
overridden when a child's resource definition has the label
`deploy.razee.io/mode=<mode>`

Mode options:

- DEFAULT: `MergePatch`
  - A simple merge, that will merge objects and replace arrays. Items previously
  defined, then removed from the definition, will be removed from the live resource.
  - "As defined in [RFC7386](https://tools.ietf.org/html/rfc7386), a Merge Patch
  is essentially a partial representation of the resource. The submitted JSON is
  "merged" with the current resource to create a new one, then the new one is
  saved. For more details on how to use Merge Patch, see the RFC." [Reference](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#patch-operations)
- `StrategicMergePatch`
  - A more complicated merge, the kubernetes apiServer has defined keys to be
  able to intelligently merge arrays it knows about.
  - "Strategic Merge Patch is a custom implementation of Merge Patch. For a
  detailed explanation of how it works and why it needed to be introduced, see
  [StrategicMergePatch](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-api-machinery/strategic-merge-patch.md)."
  [Reference](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#patch-operations)
  - [Kubectl Apply Semantics](https://kubectl.docs.kubernetes.io/pages/app_management/field_merge_semantics.html)
- `EnsureExists`
  - Will ensure the resource is created and is replaced if deleted. Will not
  enforce a definition.

### Debug Individual Resource

`.spec.resources.metadata.labels[deploy.razee.io/debug]`

Treats the live resource as EnsureExist. If any razeedeploy component is enforcing
the resource, and the label `deploy.razee.io/debug: true` exists on the live
resource, it will treat the resource as ensure exist and not override any changes.
This is useful for when you need to debug a live resource and don't want razeedeploy
overriding your changes. Note: this will only work when you add it to live resources.
If you want to have the EnsureExist behavior, see [Resource Update Mode](#Resource-Update-Mode).

- ie: `kubectl label rrs3 <your-rrs3> deploy.razee.io/debug=true`

### Lock Cluster Updates

Prevents the controller from updating resources on the cluster. If this is the
first time creating the `razeedeploy-config` ConfigMap, you must delete the running
controller pods so the deployment can mount the ConfigMap as a volume. If the
`razeedeploy-config` ConfigMap already exists, just add the pair `lock-cluster: true`.

1. `export CONTROLLER_NAME=remoteresources3decrypt-controller && export CONTROLLER_NAMESPACE=razee`
1. `kubectl create cm razeedeploy-config -n $CONTROLLER_NAMESPACE --from-literal=lock-cluster=true`
1. `kubectl delete pods -n $CONTROLLER_NAMESPACE $(kubectl get pods -n $CONTROLLER_NAMESPACE
 | grep $CONTROLLER_NAME | awk '{print $1}' | paste -s -d ',' -)`
