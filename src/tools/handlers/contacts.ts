import { google } from 'googleapis';
import { ToolContext } from './index';

export async function handleContactsTool(
  toolName: string,
  params: any,
  context: ToolContext
): Promise<any> {
  const auth = await context.tokenManager.getAuthClient(context.userId);
  const people = google.people({ version: 'v1', auth });

  switch (toolName) {
    case 'contacts_list_people':
      return listPeople(people, params);
    
    case 'contacts_get_person':
      return getPerson(people, params);
    
    case 'contacts_search_people':
      return searchPeople(people, params);
    
    case 'contacts_create_contact':
      return createContact(people, params);
    
    case 'contacts_update_contact':
      return updateContact(people, params);
    
    case 'contacts_delete_contact':
      return deleteContact(people, params);
    
    default:
      throw new Error(`Unknown Contacts tool: ${toolName}`);
  }
}

async function listPeople(people: any, params: any) {
  const response = await people.people.connections.list({
    resourceName: params.resourceName || 'people/me',
    pageSize: params.pageSize || 10,
    personFields: params.personFields?.join(',') || 'names,emailAddresses,phoneNumbers',
    sortOrder: params.sortOrder
  });

  return { 
    people: response.data.connections || [],
    nextPageToken: response.data.nextPageToken
  };
}

async function getPerson(people: any, params: any) {
  const response = await people.people.get({
    resourceName: params.resourceName,
    personFields: params.personFields?.join(',') || 'names,emailAddresses,phoneNumbers,organizations'
  });

  return response.data;
}

async function searchPeople(people: any, params: any) {
  const response = await people.people.searchContacts({
    query: params.query,
    pageSize: params.pageSize || 10,
    readMask: params.readMask?.join(',') || 'names,emailAddresses,phoneNumbers'
  });

  return { 
    results: response.data.results || [] 
  };
}

async function createContact(people: any, params: any) {
  const person: any = {
    names: [{
      givenName: params.givenName,
      familyName: params.familyName
    }]
  };

  if (params.emailAddresses) {
    person.emailAddresses = params.emailAddresses;
  }

  if (params.phoneNumbers) {
    person.phoneNumbers = params.phoneNumbers;
  }

  if (params.organizations) {
    person.organizations = params.organizations;
  }

  const response = await people.people.createContact({
    requestBody: person
  });

  return response.data;
}

async function updateContact(people: any, params: any) {
  const person: any = {};
  const updatePersonFields: string[] = [];

  if (params.givenName !== undefined || params.familyName !== undefined) {
    person.names = [{
      givenName: params.givenName,
      familyName: params.familyName
    }];
    updatePersonFields.push('names');
  }

  if (params.emailAddresses !== undefined) {
    person.emailAddresses = params.emailAddresses;
    updatePersonFields.push('emailAddresses');
  }

  if (params.phoneNumbers !== undefined) {
    person.phoneNumbers = params.phoneNumbers;
    updatePersonFields.push('phoneNumbers');
  }

  const response = await people.people.updateContact({
    resourceName: params.resourceName,
    updatePersonFields: params.updatePersonFields?.join(',') || updatePersonFields.join(','),
    requestBody: person
  });

  return response.data;
}

async function deleteContact(people: any, params: any) {
  await people.people.deleteContact({
    resourceName: params.resourceName
  });

  return { success: true };
}