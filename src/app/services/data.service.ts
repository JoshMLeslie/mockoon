import { Injectable } from '@angular/core';
import * as crypto from 'crypto';
import { Config } from 'src/app/config';
import { AscSort } from 'src/app/libs/utils.lib';
import { Store } from 'src/app/stores/store';
import { DataSubjectType, ExportType } from 'src/app/types/data.type';
import { Environment, Environments } from 'src/app/types/environment.type';
import { Route } from 'src/app/types/route.type';
import { EnvironmentLog, EnvironmentLogResponse } from 'src/app/types/server.type';
import * as url from 'url';
const appVersion = require('../../../package.json').version;

@Injectable()
export class DataService {
  private exportId = 'mockoon_export';

  constructor(private store: Store) {}

  /**
   * Wrap data to export in Mockoon export format
   *
   * @param data
   * @param subject
   */
  public wrapExport(
    data: Environments | Environment | Route,
    subject: DataSubjectType
  ): string {
    return JSON.stringify(
      <ExportType>{
        id: this.exportId,
        appVersion: appVersion,
        checksum: crypto
          .createHash('md5')
          .update(JSON.stringify(data) + Config.exportSalt)
          .digest('hex'),
        subject,
        data
      },
      null,
      4
    );
  }

  /**
   * Verify the checksum of an import
   *
   * @param importData
   */
  public verifyImportChecksum(importData: ExportType): boolean {
    if (importData.id !== this.exportId) {
      return false;
    }
    const importMD5 = crypto
      .createHash('md5')
      .update(JSON.stringify(importData.data) + Config.exportSalt)
      .digest('hex');

    return importMD5 === importData.checksum;
  }

  /**
   * Format a request log
   *
   * @param request
   */
  public formatRequestLog(request: any): EnvironmentLog {
    // use some getter to keep the scope because some request properties are being defined later by express (route, params, etc)
    const maxLength = this.store.get('settings').logSizeLimit;
    const requestLog: EnvironmentLog = {
      uuid: request.uuid,
      timestamp: new Date(),
      get route() {
        return request.route ? request.route.path : null;
      },
      method: request.method,
      protocol: request.protocol,
      url: url.parse(request.originalUrl).pathname,
      headers: [],
      get proxied() {
        return request.proxied;
      },
      get params() {
        if (request.params) {
          return Object.keys(request.params).map(paramName => {
            return { name: paramName, value: request.params[paramName] };
          });
        }

        return [];
      },
      get queryParams() {
        if (request.query) {
          return Object.keys(request.query).map(queryParamName => {
            return {
              name: queryParamName,
              value: request.query[queryParamName]
            };
          });
        }

        return [];
      },
      get body() {
        let truncatedBody: string = request.body;

        // truncate
        if (truncatedBody.length > maxLength) {
          truncatedBody =
            truncatedBody.substring(0, maxLength) +
            '\n\n-------- BODY HAS BEEN TRUNCATED --------';
        }

        return truncatedBody;
      },
      response: null
    };

    // get and sort headers
    requestLog.headers = Object.keys(request.headers)
      .map(headerName => {
        return { name: headerName, value: request.headers[headerName] };
      })
      .sort(AscSort);

    return requestLog;
  }

  /**
   * Format a response log
   *
   * @param response
   * @param body
   * @param requestUUID
   */
  public formatResponseLog(
    response: any,
    body: string,
    requestUUID: string
  ): EnvironmentLogResponse {
    // if don't have uuid it can't be found, so let's return null and consider this an error
    if (requestUUID == null) {
      return null;
    }

    // use some getter to keep the scope because some request properties are being defined later by express (route, params, etc)
    const status = response.customStatusCode && response.statusCode === 0 ? response.customStatusCode : response.statusCode;
    const responseLog: EnvironmentLogResponse = {
      requestUUID: requestUUID,
      status,
      headers: [],
      body: ''
    };
    // get and sort headers
    const headers = response.getHeaders();
    responseLog.headers = Object.keys(headers)
      .map(headerName => {
        return { name: headerName, value: headers[headerName] };
      })
      .sort(AscSort);

    const maxLength = this.store.get('settings').logSizeLimit;
    responseLog.body = (function() {
      let truncatedBody: string = body;

      // truncate
      if (truncatedBody.length > maxLength) {
        truncatedBody =
          truncatedBody.substring(0, maxLength) +
          '\n\n-------- BODY HAS BEEN TRUNCATED --------';
      }

      return truncatedBody;
    })();

    return responseLog;
  }

  /**
   * Generate a unused port to a new environment
   */
  public getNewEnvironmentPort(): number {
    const usedPorts = this.store.getEnvironmentsPorts();
    const activeEnvironment: Environment = this.store.getActiveEnvironment();
    const min = Math.ceil(1024);
    const max = Math.floor(65535);
    let testSelectedPort: number;

    if (activeEnvironment == null) {
      testSelectedPort = 3000;
    } else {
      testSelectedPort = activeEnvironment.port + 1;
    }

    for (let i = 0; i < 10; i++) {
      if (testSelectedPort >= 65535) {
        break;
      } else if (!usedPorts.includes(testSelectedPort)) {
        return testSelectedPort;
      }
      testSelectedPort++;
    }

    do {
      testSelectedPort = Math.floor(Math.random() * (max - min)) + min;
    } while (usedPorts.includes(testSelectedPort));

    return testSelectedPort;
  }
}
